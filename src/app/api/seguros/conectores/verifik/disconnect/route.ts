import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { disconnectInsurerConnection } from "@/lib/insurers/insurer-connections-db";

export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  await disconnectInsurerConnection(db, orgCtx.organizationId, "verifik");

  return NextResponse.json({ ok: true });
}
