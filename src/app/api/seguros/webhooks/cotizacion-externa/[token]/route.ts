import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getExternalQuoteSourceByToken } from "@/lib/insurers/external-quote-sources-db";
import { findPendingQuoteRequestByPlaca, getQuoteRequestById, markQuoteRequestQuoted } from "@/lib/insurers/quote-requests-db";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Webhook de entrada para sistemas externos que puedan EMPUJAR un resultado
 * de cotización a Noova (ej. Agentemotor — validado en la investigación de
 * competencia: tiene forma de enviar información a Noova, no de recibirla,
 * así que el único camino es que Noova exponga esto). Sin integración real
 * probada todavía — payload genérico documentado, no el formato exacto de
 * ningún proveedor específico.
 *
 * Body esperado:
 * { quote_request_id?, placa, documento_tomador?, aseguradora, prima, vigencia_desde?, vigencia_hasta? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const source = await getExternalQuoteSourceByToken(adminClient(), token);
  if (!source) {
    return NextResponse.json({ error: "Token inválido o fuente desconectada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const quoteRequestId = typeof body.quote_request_id === "string" ? body.quote_request_id.trim() : "";
  const placa = typeof body.placa === "string" ? body.placa.trim() : "";
  const documentoTomador = typeof body.documento_tomador === "string" ? body.documento_tomador.trim() : undefined;
  const aseguradora = typeof body.aseguradora === "string" ? body.aseguradora.trim() : source.label;
  const prima = typeof body.prima === "number" ? body.prima : null;

  if (!quoteRequestId && !placa) {
    return NextResponse.json({ error: "Falta quote_request_id o placa para identificar la cotización" }, { status: 400 });
  }

  const db = adminClient();
  const record = quoteRequestId
    ? await getQuoteRequestById(db, source.organizationId, quoteRequestId)
    : await findPendingQuoteRequestByPlaca(db, source.organizationId, placa, documentoTomador);

  if (!record) {
    return NextResponse.json({ error: "No se encontró una cotización pendiente que coincida" }, { status: 404 });
  }
  if (record.estado !== "pendiente") {
    return NextResponse.json({ error: `Esa cotización ya está en estado "${record.estado}"` }, { status: 409 });
  }

  await markQuoteRequestQuoted(db, record.id, {
    resultado: {
      aseguradora,
      prima,
      vigencia_desde: typeof body.vigencia_desde === "string" ? body.vigencia_desde : null,
      vigencia_hasta: typeof body.vigencia_hasta === "string" ? body.vigencia_hasta : null
    },
    externalSource: source.label
  });

  return NextResponse.json({ ok: true });
}
