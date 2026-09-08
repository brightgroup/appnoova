import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getSoftsegurosConnection } from "@/lib/softseguros/connections-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connection = await getSoftsegurosConnection(db, orgCtx.organizationId);

  return NextResponse.json({ connection });
}
