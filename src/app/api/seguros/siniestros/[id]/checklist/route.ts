import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { updateSiniestroChecklistItem } from "@/lib/insurers/siniestros-db";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const documento = String(body?.documento ?? "").trim();
  const recibido = body?.recibido === true;
  if (!documento) return NextResponse.json({ error: "Falta el documento" }, { status: 400 });

  const db = adminClient();
  const siniestro = await updateSiniestroChecklistItem(db, orgCtx.organizationId, id, documento, recibido);
  if (!siniestro) return NextResponse.json({ error: "Siniestro no encontrado" }, { status: 404 });

  return NextResponse.json({ siniestro });
}
