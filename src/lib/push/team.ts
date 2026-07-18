import { adminClient } from "@/lib/voice-agents-server";
import { PERMISSION_LEVEL_RANK, type PermissionLevel } from "@/types/rbac";

type RolePermRow = { module_key: string; level: PermissionLevel };
type MemberRoleJoin = { role_permissions?: RolePermRow[] | null } | null;

function memberHasInboxAccess(role: MemberRoleJoin | MemberRoleJoin[]): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  for (const r of roles) {
    const perms = r?.role_permissions ?? [];
    for (const p of perms) {
      if (p.module_key !== "inbox") continue;
      if (PERMISSION_LEVEL_RANK[p.level] >= PERMISSION_LEVEL_RANK.view) return true;
    }
  }
  return false;
}

/**
 * user_id de miembros activos de la organización con acceso al inbox
 * (rol con módulo "inbox" ≥ view). Compartido entre el email de handoff
 * (src/lib/email/notify-handoff.ts) y las notificaciones push.
 */
export async function getOrgInboxTeamUserIds(organizationId: string): Promise<string[]> {
  const db = adminClient();
  const { data: members } = await db
    .from("organization_members")
    .select("user_id, roles(role_permissions(module_key, level))")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return (members ?? [])
    .filter(m => memberHasInboxAccess(m.roles as MemberRoleJoin | MemberRoleJoin[]))
    .map(m => String(m.user_id))
    .filter(Boolean);
}
