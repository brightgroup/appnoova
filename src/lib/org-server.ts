import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import type { AccountStatus, PermissionLevel } from "@/types/rbac";
import { PERMISSION_LEVEL_RANK } from "@/types/rbac";

export interface OrgMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  status: AccountStatus;
  role_slug: string;
  role_name: string;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  organizationName: string;
  membership: OrgMembership;
}

function relOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function resolveOrganizationId(
  db: ReturnType<typeof adminClient>,
  userId: string
): Promise<{ id: string; name: string } | null> {
  const { data: active } = await db
    .from("user_active_organization")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", userId)
    .maybeSingle();

  const orgFromActive = relOne(active?.organizations as { id: string; name: string } | { id: string; name: string }[] | null);
  if (orgFromActive?.id) return orgFromActive;

  const { data: owned } = await db
    .from("organizations")
    .select("id, name")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (owned) return owned;

  const { data: member } = await db
    .from("organization_members")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at")
    .limit(1)
    .maybeSingle();

  const orgFromMember = relOne(member?.organizations as { id: string; name: string } | { id: string; name: string }[] | null);
  if (orgFromMember?.id) return orgFromMember;

  return null;
}

export async function getOrgPermissionLevel(
  userId: string,
  organizationId: string,
  moduleKey: string
): Promise<PermissionLevel> {
  const db = adminClient();
  const { data, error } = await db.rpc("user_org_permission_level", {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_module_key: moduleKey,
  });

  if (error) {
    const { data: member } = await db
      .from("organization_members")
      .select("role_id, roles(role_permissions(module_key, level))")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .maybeSingle();

    const perms = (member?.roles as { role_permissions?: { module_key: string; level: PermissionLevel }[] } | null)
      ?.role_permissions;
    const hit = perms?.find((p) => p.module_key === moduleKey);
    return hit?.level ?? "none";
  }

  return (data as PermissionLevel) ?? "none";
}

export function hasOrgPermission(level: PermissionLevel, min: PermissionLevel): boolean {
  return PERMISSION_LEVEL_RANK[level] >= PERMISSION_LEVEL_RANK[min];
}

export async function getOrgContextFromRequest(
  req: NextRequest,
  options?: { module?: string; minLevel?: PermissionLevel }
): Promise<OrgContext | NextResponse> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = adminClient();
  const org = await resolveOrganizationId(db, userId);
  if (!org) {
    return NextResponse.json({ error: "Sin organización activa" }, { status: 404 });
  }

  const { data: member, error } = await db
    .from("organization_members")
    .select("id, organization_id, user_id, role_id, status, roles(slug, name)")
    .eq("user_id", userId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error || !member || member.status !== "active") {
    return NextResponse.json({ error: "No eres miembro activo de esta organización" }, { status: 403 });
  }

  const role = relOne(member.roles as { slug: string; name: string } | { slug: string; name: string }[] | null);
  const ctx: OrgContext = {
    userId,
    organizationId: org.id,
    organizationName: org.name,
    membership: {
      id: member.id,
      organization_id: member.organization_id,
      user_id: member.user_id,
      role_id: member.role_id,
      status: member.status as AccountStatus,
      role_slug: role?.slug ?? "",
      role_name: role?.name ?? "",
    },
  };

  if (options?.module && options.minLevel) {
    const level = await getOrgPermissionLevel(userId, org.id, options.module);
    if (!hasOrgPermission(level, options.minLevel)) {
      return NextResponse.json({ error: "Sin permiso para esta acción" }, { status: 403 });
    }
  }

  return ctx;
}

export async function getOrgRoleById(db: ReturnType<typeof adminClient>, orgId: string, roleId: string) {
  const { data } = await db
    .from("roles")
    .select("id, slug, name, organization_id")
    .eq("id", roleId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data;
}
