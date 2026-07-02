import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest, type OrgContext } from "@/lib/org-server";
import type { OrgPermissionModuleKey, PermissionLevel } from "@/types/rbac";

/** Verifica membresía org + permiso de módulo antes de ejecutar la API. */
export async function requireOrgModule(
  req: NextRequest,
  module: OrgPermissionModuleKey,
  minLevel: PermissionLevel = "view"
): Promise<OrgContext | NextResponse> {
  return getOrgContextFromRequest(req, { module, minLevel });
}
