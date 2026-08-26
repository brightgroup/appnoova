import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";
import { getInventoryItem, registerInventoryMovement } from "@/lib/erp/inventory-db";
import { maybeSendLowStockAlert } from "@/lib/erp/low-stock-alert";

/**
 * Registra varios movimientos (uno por producto) bajo un mismo número de
 * pedido — para cuando una sola orden mueve varios productos a la vez.
 * Cada línea se aplica con su propio registerInventoryMovement (atómico por
 * producto); si una línea falla las anteriores ya quedaron aplicadas, así
 * que se reporta qué líneas sí y cuáles no en vez de fingir todo-o-nada.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tipo = body.tipo === "salida" ? "salida" : "entrada";

  const ctx = await requireOrgModule(req, "erp", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const gate = await assertOrgErpEnabled(db, ctx.organizationId);
  if (gate.ok === false) return NextResponse.json({ error: gate.message }, { status: 403 });

  const numeroPedido = typeof body.numero_pedido === "string" ? body.numero_pedido.trim() || null : null;
  const fecha = typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : undefined;
  const responsable = typeof body.responsable === "string" ? body.responsable.trim() || null : null;
  const nota = typeof body.nota === "string" ? body.nota.trim() || null : null;

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "Se requiere al menos un producto" }, { status: 400 });
  }

  const lines: { itemId: string; cantidad: number }[] = [];
  for (const raw of rawItems) {
    const itemId = String(raw?.item_id ?? "").trim();
    const cantidad = Number(raw?.cantidad);
    if (!itemId || !Number.isFinite(cantidad) || !Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: "Cada línea necesita item_id y cantidad (entero positivo)" }, { status: 400 });
    }
    lines.push({ itemId, cantidad });
  }

  const results: { item_id: string; movement_id: string; existencia: number }[] = [];
  const errors: { item_id: string; error: string }[] = [];

  for (const line of lines) {
    try {
      const item = await getInventoryItem(db, ctx.organizationId, line.itemId);
      if (!item) {
        errors.push({ item_id: line.itemId, error: "Producto no encontrado" });
        continue;
      }
      const delta = tipo === "salida" ? -line.cantidad : line.cantidad;
      const result = await registerInventoryMovement(db, ctx.organizationId, {
        itemId: line.itemId,
        tipo,
        delta,
        fecha,
        responsable,
        nota,
        numeroPedido,
        createdBy: ctx.userId
      });
      results.push({ item_id: line.itemId, movement_id: result.movementId, existencia: result.existencia });

      if (result.debeAlertar) {
        void maybeSendLowStockAlert(db, ctx.organizationId, {
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          existencia: result.existencia,
          stockMinimo: result.stockMinimo ?? 0
        }).catch(err => console.error("[erp] alerta stock mínimo:", err));
      }
    } catch (err) {
      errors.push({ item_id: line.itemId, error: err instanceof Error ? err.message : "Error al registrar" });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, results, errors }, { status: errors.length === 0 ? 201 : 207 });
}
