import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getOriInventoryAccess, setOriInventoryAccess } from "@/lib/erp/ori-access-db";

export async function GET(req: NextRequest) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const enabled = await getOriInventoryAccess(db, ctx.organizationId);
  return NextResponse.json({ enabled });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled debe ser boolean" }, { status: 400 });
  }

  const db = adminClient();
  try {
    await setOriInventoryAccess(db, ctx.organizationId, body.enabled);
    return NextResponse.json({ enabled: body.enabled });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al guardar" }, { status: 500 });
  }
}
