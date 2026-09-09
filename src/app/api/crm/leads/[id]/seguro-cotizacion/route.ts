import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmLeadVisibility } from "@/lib/crm-auth";
import { getQuoteGuidanceForLead } from "@/lib/insurers/quote-guidance";
import { getOrgContextFromRequest } from "@/lib/org-server";

type Ctx = { params: Promise<{ id: string }> };

/** Guía paso a paso de la cotización de seguro ligada a este lead — misma lógica que usa la tool de ORI (ver quote-guidance.ts). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const visibility = await getCrmLeadVisibility(req, "view");
  if (visibility instanceof NextResponse) return visibility;
  const { tenantUserId, callerUserId, canManageAll } = visibility;

  const { id: leadId } = await ctx.params;
  const db = textAgentsAdminClient();

  let leadQuery = db.from("crm_leads").select("id").eq("id", leadId).eq("user_id", tenantUserId);
  if (!canManageAll) leadQuery = leadQuery.eq("assigned_user_id", callerUserId);
  const { data: lead } = await leadQuery.maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  // La cotización vive escopada por organización (insurance_quote_requests), no por el tenant de CRM.
  const orgCtx = await getOrgContextFromRequest(req, { module: "crm", minLevel: "view" });
  if (orgCtx instanceof NextResponse) return orgCtx;

  const guidance = await getQuoteGuidanceForLead(db, orgCtx.organizationId, leadId);
  return NextResponse.json(guidance);
}
