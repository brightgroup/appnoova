import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteGuidanceById } from "@/lib/insurers/quote-guidance";

type Ctx = { params: Promise<{ id: string }> };

/** Ficha completa de una cotización puntual — misma guía (paso/mensaje/campos) que ya usa el panel multi-ramo del lead, pero por id en vez de por lead. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const guidance = await getQuoteGuidanceById(db, orgCtx.organizationId, id);
  if (!guidance || !guidance.quote) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  let leadTitle: string | null = null;
  if (guidance.quote.leadId) {
    const { data: lead } = await db.from("crm_leads").select("title").eq("id", guidance.quote.leadId).maybeSingle();
    leadTitle = (lead?.title as string | undefined) ?? null;
  }

  return NextResponse.json({ ...guidance, leadTitle });
}
