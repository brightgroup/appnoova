import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest, getOrgPermissionLevel, hasOrgPermission } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — organización activa, membresía y permisos del usuario */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const orgUsersLevel = await getOrgPermissionLevel(ctx.userId, ctx.organizationId, "org_users");

  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, plan, status")
    .eq("id", ctx.organizationId)
    .single();

  return NextResponse.json({
    organization: org,
    membership: ctx.membership,
    permissions: {
      org_users: orgUsersLevel,
      can_view_team: hasOrgPermission(orgUsersLevel, "view"),
      can_manage_team: hasOrgPermission(orgUsersLevel, "edit"),
      can_admin_team: hasOrgPermission(orgUsersLevel, "manage"),
    },
  });
}
