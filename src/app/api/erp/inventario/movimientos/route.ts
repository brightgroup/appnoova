import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";
import {
  attachCreatedByLabels,
  getInventoryItem,
  listInventoryMovements,
  registerInventoryMovement
} from "@/lib/erp/inventory-db";
import { getInventoryAlertRule } from "@/lib/erp/alert-rules-db";
import { notifyLowStock } from "@/lib/email/notify-low-stock";

export async function GET(req: NextRequest) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const itemId = req.nextUrl.searchParams.get("item_id") ?? undefined;
  const db = adminClient();

  try {
    const movements = await attachCreatedByLabels(db, await listInventoryMovements(db, ctx.organizationId, { itemId }));
    return NextResponse.json({ movements });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al listar" }, { status: 500 });
  }
}

/**
 * Registra una entrada, salida o ajuste. Entrada/salida solo necesitan "edit"
 * (cualquier usuario de bodega); ajuste — una corrección directa de existencia,
 * no ligada a un movimiento físico real — exige "manage", que es el nivel
 * reservado al dueño/rol autorizado a tocar cantidades a mano.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tipo = body.tipo === "salida" || body.tipo === "ajuste" ? body.tipo : "entrada";

  const ctx = await requireOrgModule(req, "erp", tipo === "ajuste" ? "manage" : "edit");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const gate = await assertOrgErpEnabled(db, ctx.organizationId);
  if (gate.ok === false) return NextResponse.json({ error: gate.message }, { status: 403 });

  const itemId = String(body.item_id ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "item_id es requerido" }, { status: 400 });

  let delta: number;
  if (tipo === "ajuste") {
    delta = Number(body.delta);
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      return NextResponse.json({ error: "delta debe ser un entero distinto de 0" }, { status: 400 });
    }
  } else {
    const cantidad = Number(body.cantidad);
    if (!Number.isFinite(cantidad) || !Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: "cantidad debe ser un entero positivo" }, { status: 400 });
    }
    delta = tipo === "salida" ? -cantidad : cantidad;
  }

  const item = await getInventoryItem(db, ctx.organizationId, itemId);
  if (!item) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const fecha = typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : undefined;
  const responsable = typeof body.responsable === "string" ? body.responsable.trim() || null : null;
  const nota = typeof body.nota === "string" ? body.nota.trim() || null : null;

  try {
    const result = await registerInventoryMovement(db, ctx.organizationId, {
      itemId,
      tipo,
      delta,
      fecha,
      responsable,
      nota,
      createdBy: ctx.userId
    });

    if (result.debeAlertar) {
      void maybeSendLowStockAlert(db, ctx.organizationId, {
        id: item.id,
        codigo: item.codigo,
        nombre: item.nombre,
        existencia: result.existencia,
        stockMinimo: result.stockMinimo ?? 0
      }).catch(err => console.error("[erp] alerta stock mínimo:", err));
    }

    return NextResponse.json({ movement_id: result.movementId, existencia: result.existencia }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al registrar" }, { status: 500 });
  }
}

async function maybeSendLowStockAlert(
  db: ReturnType<typeof adminClient>,
  organizationId: string,
  item: { id: string; codigo: string; nombre: string; existencia: number; stockMinimo: number }
): Promise<void> {
  const rule = await getInventoryAlertRule(db, organizationId);
  if (!rule.enabled || !rule.canalEmail) return;
  if (rule.modo !== "al_cruzar" && rule.modo !== "ambos") return;
  await notifyLowStock({ organizationId, items: [item] });
}
