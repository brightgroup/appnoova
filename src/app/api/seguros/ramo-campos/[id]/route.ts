import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { deleteCampo } from "@/lib/insurers/poliza-ramo-campos-db";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  await deleteCampo(db, ctx.organizationId, id);
  return NextResponse.json({ ok: true });
}
