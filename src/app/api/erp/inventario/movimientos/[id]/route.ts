import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { deleteInventoryMovement } from "@/lib/erp/inventory-db";

type Ctx = { params: Promise<{ id: string }> };

/** Borra un movimiento — solo "manage" (dueño/admin de la organización), revierte la existencia. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();

  try {
    const result = await deleteInventoryMovement(db, ctx.organizationId, id);
    return NextResponse.json({ ok: true, item_id: result.itemId, existencia: result.existencia });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al eliminar" }, { status: 500 });
  }
}
