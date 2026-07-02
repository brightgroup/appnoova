import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import type { OrgContext } from "@/lib/org-server";
import type { PermissionLevel } from "@/types/rbac";

export interface CrmRequestContext extends OrgContext {}

export async function requireCrmAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<CrmRequestContext | NextResponse> {
  return requireOrgModule(req, "crm", minLevel);
}

export async function getCrmUserId(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<string | NextResponse> {
  const ctx = await requireCrmAccess(req, minLevel);
  if (ctx instanceof NextResponse) return ctx;
  return ctx.userId;
}
