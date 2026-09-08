import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { listSiniestros, type SiniestroEstado } from "@/lib/insurers/siniestros-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const estado = req.nextUrl.searchParams.get("estado") as SiniestroEstado | null;
  const db = adminClient();
  const siniestros = await listSiniestros(db, orgCtx.organizationId, estado ? { estado } : undefined);

  return NextResponse.json({ siniestros });
}
