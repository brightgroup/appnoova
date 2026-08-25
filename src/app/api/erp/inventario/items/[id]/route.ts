import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getInventoryItem, updateInventoryItem } from "@/lib/erp/inventory-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();

  const item = await getInventoryItem(db, ctx.organizationId, id);
  if (!item) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  return NextResponse.json({ item });
}

/** Edita datos del producto y, opcionalmente, stock_minimo — no toca existencia (eso solo vía movimientos). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const existing = await getInventoryItem(db, ctx.organizationId, id);
  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const patch: Parameters<typeof updateInventoryItem>[3] = {};
  if (typeof body.nombre === "string" && body.nombre.trim()) patch.nombre = body.nombre;
  if ("marca" in body) patch.marca = body.marca;
  if ("responsable" in body) patch.responsable = body.responsable;
  if ("stock_minimo" in body) {
    const raw = body.stock_minimo;
    const value = raw === null || raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "stock_minimo inválido" }, { status: 400 });
    }
    patch.stockMinimo = value;
  }
  if (typeof body.activo === "boolean") patch.activo = body.activo;

  try {
    const item = await updateInventoryItem(db, ctx.organizationId, id, patch);
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al editar" }, { status: 500 });
  }
}

/** Desactiva el producto (no se borra: conserva su kardex). */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();

  const existing = await getInventoryItem(db, ctx.organizationId, id);
  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  try {
    await updateInventoryItem(db, ctx.organizationId, id, { activo: false });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al desactivar" }, { status: 500 });
  }
}
