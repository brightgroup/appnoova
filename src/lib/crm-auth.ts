import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
import type { OrgContext } from "@/lib/org-server";
import type { PermissionLevel } from "@/types/rbac";

export interface CrmRequestContext extends OrgContext {}

export async function requireCrmAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<CrmRequestContext | NextResponse> {
  return requireOrgModule(req, "crm", minLevel);
}

/** user_id bajo el cual viven los datos CRM compartidos de la org (propietario). */
export async function getCrmUserId(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<string | NextResponse> {
  const ctx = await requireCrmAccess(req, minLevel);
  if (ctx instanceof NextResponse) return ctx;
  return resolveOrgCrmTenantUserId(ctx.organizationId, ctx.userId);
}
