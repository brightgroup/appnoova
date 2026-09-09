import { NextRequest, NextResponse } from "next/server";
import { requireCrmAccess } from "@/lib/crm-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { applyInsurancePipelineTemplate, getCrmStages } from "@/lib/crm-server";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";

/** Aplica INSURANCE_PIPELINE_TEMPLATE — solo agrega las etapas que falten, nunca borra ni pisa las existentes. */
export async function POST(req: NextRequest) {
  const ctx = await requireCrmAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const db = textAgentsAdminClient();
  const tenantUserId = await resolveOrgCrmTenantUserId(ctx.organizationId, ctx.userId);

  await applyInsurancePipelineTemplate(db, tenantUserId);
  const stages = await getCrmStages(db, tenantUserId);
  return NextResponse.json({ stages });
}
