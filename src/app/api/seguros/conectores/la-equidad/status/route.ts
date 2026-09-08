import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getInsurerConnectionRecord } from "@/lib/insurers/insurer-connections-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connection = await getInsurerConnectionRecord(db, orgCtx.organizationId, "la_equidad");

  return NextResponse.json({ connection });
}
