import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestByPublicToken, markQuoteRequestAccepted } from "@/lib/insurers/quote-requests-db";
import { notifyPushForOrg } from "@/lib/push/send";

type Ctx = { params: Promise<{ token: string }> };

/** El cliente aceptó la cotización desde el link público — notifica al equipo, no mueve el pipeline solo. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = adminClient();

  const quote = await getQuoteRequestByPublicToken(db, token);
  if (!quote) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const updated = await markQuoteRequestAccepted(db, quote.id);
  if (!updated) return NextResponse.json({ error: "No se pudo registrar la aceptación" }, { status: 500 });

  void notifyPushForOrg(quote.organizationId, {
    title: "¡Cotización aceptada!",
    body: `${quote.tomador.nombre_tomador ?? "El cliente"} aceptó la cotización de ${quote.ramo}.`,
    url: quote.leadId ? `/m/leads/${quote.leadId}` : "/m/chats",
    tag: `quote-accepted-${quote.id}`
  });

  return NextResponse.json({ ok: true });
}
