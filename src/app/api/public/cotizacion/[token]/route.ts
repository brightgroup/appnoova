import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestByPublicToken } from "@/lib/insurers/quote-requests-db";
import { listMicrositesForOrg } from "@/lib/microsite-server";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";

type Ctx = { params: Promise<{ token: string }> };

const RAMO_LABEL: Record<string, string> = { autos: "Seguro de Auto", vida: "Seguro de Vida", hogar: "Seguro de Hogar", salud: "Seguro de Salud" };

/**
 * Ruta pública sin sesión — el token ES la autenticación (igual que
 * external_quote_sources). Devuelve un DTO saneado: nada de ids internos de
 * lead/contacto/organización, solo lo que el cliente final debe ver.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = adminClient();

  const quote = await getQuoteRequestByPublicToken(db, token);
  if (!quote || (quote.estado !== "cotizada" && quote.estado !== "enviada_externa")) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  const { data: org } = await db.from("organizations").select("name").eq("id", quote.organizationId).maybeSingle();

  const microsites = await listMicrositesForOrg(db, quote.organizationId);
  const branding = microsites.find(m => m.is_published);

  const tenantUserId = await resolveOrgCrmTenantUserId(quote.organizationId, "");
  const { data: whatsappChannel } = tenantUserId
    ? await db.from("whatsapp_channels").select("e164").eq("user_id", tenantUserId).eq("status", "active").maybeSingle()
    : { data: null };

  return NextResponse.json({
    ramo: quote.ramo,
    ramoLabel: RAMO_LABEL[quote.ramo] ?? `Seguro de ${quote.ramo}`,
    tomadorNombre: quote.tomador.nombre_tomador ?? null,
    resultado: quote.resultado,
    organizationName: org?.name ?? "Noova Seguros",
    logoUrl: branding?.logo_url ?? null,
    accentColor: branding?.accent_color || "#0f7eff",
    whatsappE164: whatsappChannel?.e164 ?? null
  });
}
