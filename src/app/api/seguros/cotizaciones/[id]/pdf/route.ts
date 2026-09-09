import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestById } from "@/lib/insurers/quote-requests-db";
import { generateQuotePdfBuffer } from "@/lib/insurers/quote-pdf";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const quote = await getQuoteRequestById(db, orgCtx.organizationId, id);
  if (!quote) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (quote.estado !== "cotizada" && quote.estado !== "enviada_externa") {
    return NextResponse.json({ error: "Esta cotización todavía no tiene un precio real registrado." }, { status: 400 });
  }

  const { data: org } = await db.from("organizations").select("name").eq("id", orgCtx.organizationId).maybeSingle();
  const companyName = org?.name ?? "Noova Seguros";

  const pdfBuffer = await generateQuotePdfBuffer(quote, companyName);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotizacion-${quote.ramo}-${id.slice(0, 8)}.pdf"`
    }
  });
}
