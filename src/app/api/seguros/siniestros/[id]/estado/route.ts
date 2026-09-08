import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { updateSiniestroEstado, type SiniestroEstado } from "@/lib/insurers/siniestros-db";

type Ctx = { params: Promise<{ id: string }> };

const VALID: SiniestroEstado[] = [
  "reportado",
  "documentos_pendientes",
  "en_forma",
  "radicado",
  "pagado",
  "rechazado",
  "cerrado"
];

export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const estado = String(body?.estado ?? "") as SiniestroEstado;
  if (!VALID.includes(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const db = adminClient();
  await updateSiniestroEstado(db, orgCtx.organizationId, id, estado);

  return NextResponse.json({ ok: true });
}
