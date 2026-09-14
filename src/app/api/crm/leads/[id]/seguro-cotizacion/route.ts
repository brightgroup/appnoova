import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmLeadVisibility } from "@/lib/crm-auth";
import { listQuoteGuidanceForLead } from "@/lib/insurers/quote-guidance";
import { createQuoteRequestForLead } from "@/lib/insurers/quote-requests-db";
import { RAMOS_COTIZABLES, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";
import { getOrgContextFromRequest } from "@/lib/org-server";

type Ctx = { params: Promise<{ id: string }> };

async function loadLeadForVisibleOrg(req: NextRequest, leadId: string, minLevel: "view" | "edit") {
  const visibility = await getCrmLeadVisibility(req, minLevel);
  if (visibility instanceof NextResponse) return visibility;
  const { tenantUserId, callerUserId, canManageAll } = visibility;

  const db = textAgentsAdminClient();
  let leadQuery = db.from("crm_leads").select("id,contact_id").eq("id", leadId).eq("user_id", tenantUserId);
  if (!canManageAll) leadQuery = leadQuery.eq("assigned_user_id", callerUserId);
  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  // La cotización vive escopada por organización (insurance_quote_requests), no por el tenant de CRM.
  const orgCtx = await getOrgContextFromRequest(req, { module: "crm", minLevel });
  if (orgCtx instanceof NextResponse) return orgCtx;

  return { db, organizationId: orgCtx.organizationId, contactId: lead.contact_id as string | null };
}

/** Guía paso a paso de CADA cotización de seguro ligada a este lead — misma lógica que usa la tool de ORI (ver quote-guidance.ts). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id: leadId } = await ctx.params;
  const loaded = await loadLeadForVisibleOrg(req, leadId, "view");
  if (loaded instanceof NextResponse) return loaded;

  const guidances = await listQuoteGuidanceForLead(loaded.db, loaded.organizationId, leadId);
  return NextResponse.json({ guidances });
}

/** Arranca una cotización vacía para un ramo nuevo en este lead — botón "+ Nueva cotización" del panel. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: leadId } = await ctx.params;
  const loaded = await loadLeadForVisibleOrg(req, leadId, "edit");
  if (loaded instanceof NextResponse) return loaded;

  const body = await req.json().catch(() => ({}));
  const ramo = typeof body.ramo === "string" ? body.ramo : "";
  if (!Object.keys(RAMOS_COTIZABLES).includes(ramo)) {
    return NextResponse.json({ error: "Ramo inválido" }, { status: 400 });
  }

  const quote = await createQuoteRequestForLead(loaded.db, loaded.organizationId, {
    leadId,
    contactId: loaded.contactId,
    ramo: ramo as RamoCotizable,
    source: "manual"
  });
  return NextResponse.json({ quote });
}
