import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { normalizeInventoryRows, parseInventoryWorkbook, type InventoryColumnMap } from "@/lib/erp/import";
import { listInventoryItems, registerInventoryMovement } from "@/lib/erp/inventory-db";

/**
 * POST — confirma la importación: crea los productos y, por cada uno con
 * existencia ≠ 0, un movimiento "saldo_inicial" con esa cantidad (así el
 * kardex arranca consistente con el maestro, igual que exige
 * erp_register_movement para cualquier cambio de existencia).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  const columnMapRaw = form.get("column_map");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  let columnMap: InventoryColumnMap;
  try {
    columnMap = JSON.parse(String(columnMapRaw ?? "{}"));
  } catch {
    return NextResponse.json({ error: "column_map inválido" }, { status: 400 });
  }

  const db = adminClient();

  let report: ReturnType<typeof normalizeInventoryRows>;
  try {
    const { rows } = parseInventoryWorkbook(await file.arrayBuffer());
    report = normalizeInventoryRows(rows, columnMap);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }

  const existingItems = await listInventoryItems(db, ctx.organizationId, { includeInactive: true });
  const existingCodigos = new Set(existingItems.map(i => i.codigo.toLowerCase()));

  const toCreate = report.valid.filter(row => !existingCodigos.has(row.codigo.toLowerCase()));
  const skippedExisting = report.valid.length - toCreate.length;

  if (toCreate.length === 0) {
    return NextResponse.json({
      created: 0,
      skipped_existing: skippedExisting,
      duplicate_codigos: report.duplicateCodigos,
      missing_codigo: report.missingCodigo,
      missing_nombre: report.missingNombre
    });
  }

  const { data: insertedRows, error: insertError } = await db
    .from("erp_inventory_items")
    .insert(
      toCreate.map(row => ({
        organization_id: ctx.organizationId,
        codigo: row.codigo,
        nombre: row.nombre,
        marca: row.marca,
        responsable: row.responsable,
        stock_minimo: row.stockMinimo,
        created_by_user_id: ctx.userId
      }))
    )
    .select("id, codigo");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const idByCodigo = new Map((insertedRows ?? []).map(r => [String(r.codigo).toLowerCase(), r.id as string]));

  let movementsCreated = 0;
  for (const row of toCreate) {
    if (row.existencia === 0) continue;
    const itemId = idByCodigo.get(row.codigo.toLowerCase());
    if (!itemId) continue;
    try {
      await registerInventoryMovement(db, ctx.organizationId, {
        itemId,
        tipo: "saldo_inicial",
        delta: row.existencia,
        responsable: row.responsable,
        nota: "Importado desde Excel — existencia inicial",
        createdBy: ctx.userId
      });
      movementsCreated++;
    } catch (err) {
      console.error("[erp/import] saldo_inicial:", row.codigo, err);
    }
  }

  return NextResponse.json({
    created: toCreate.length,
    movements_created: movementsCreated,
    skipped_existing: skippedExisting,
    duplicate_codigos: report.duplicateCodigos,
    missing_codigo: report.missingCodigo,
    missing_nombre: report.missingNombre
  });
}
