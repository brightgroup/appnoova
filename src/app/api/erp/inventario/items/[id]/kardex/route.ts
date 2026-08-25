import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { attachCreatedByLabels, getInventoryItem, listInventoryMovements } from "@/lib/erp/inventory-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();

  const item = await getInventoryItem(db, ctx.organizationId, id);
  if (!item) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const movements = await attachCreatedByLabels(db, await listInventoryMovements(db, ctx.organizationId, { itemId: id }));
  return NextResponse.json({ item, movements });
}
