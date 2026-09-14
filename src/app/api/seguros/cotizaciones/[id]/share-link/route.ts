import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestById, ensureQuoteRequestPublicToken } from "@/lib/insurers/quote-requests-db";
import { getAppBaseUrl } from "@/lib/telephony/app-url";

type Ctx = { params: Promise<{ id: string }> };

/** Genera (o reutiliza) el link público de la cotización para compartir con el cliente — estilo Figuro. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const record = await getQuoteRequestById(db, orgCtx.organizationId, id);
  if (!record) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (record.estado !== "cotizada" && record.estado !== "enviada_externa") {
    return NextResponse.json(
      { error: "Solo se puede generar un link una vez que la cotización tiene un precio real registrado." },
      { status: 400 }
    );
  }

  const token = await ensureQuoteRequestPublicToken(db, orgCtx.organizationId, id);
  if (!token) return NextResponse.json({ error: "No se pudo generar el link" }, { status: 500 });

  return NextResponse.json({ url: `${getAppBaseUrl()}/cotizacion/${token}` });
}
