import { NextRequest, NextResponse } from "next/server";
import {
  getOrgContextFromRequest,
  getAllOrgPermissions,
  hasOrgPermission,
} from "@/lib/org-server";
import { buildPermissionFlags } from "@/lib/org-permissions";
import { parseOrgBranding } from "@/lib/org-branding";
import { parseOrgModules } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — organización activa, membresía y permisos del usuario */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const permissions = await getAllOrgPermissions(ctx.userId, ctx.organizationId);
  const orgUsersLevel = permissions.org_users;

  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, plan, status, settings")
    .eq("id", ctx.organizationId)
    .single();

  const branding = parseOrgBranding(org?.settings);
  const modules = parseOrgModules(org?.settings);

  return NextResponse.json({
    organization: org,
    membership: ctx.membership,
    permissions,
    flags: buildPermissionFlags(permissions),
    branding,
    modules,
    permissions_legacy: {
      org_users: orgUsersLevel,
      can_view_team: hasOrgPermission(orgUsersLevel, "view"),
      can_manage_team: hasOrgPermission(orgUsersLevel, "edit"),
      can_admin_team: hasOrgPermission(orgUsersLevel, "manage"),
    },
  });
}
