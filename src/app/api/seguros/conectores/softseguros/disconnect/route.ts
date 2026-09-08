import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";

export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  await db
    .from("softseguros_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("organization_id", orgCtx.organizationId);

  return NextResponse.json({ ok: true });
}
