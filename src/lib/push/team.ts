import { adminClient } from "@/lib/voice-agents-server";
import { PERMISSION_LEVEL_RANK, type PermissionLevel } from "@/types/rbac";

type RolePermRow = { module_key: string; level: PermissionLevel };
type MemberRoleJoin = { role_permissions?: RolePermRow[] | null } | null;

function memberHasModuleAccess(
  role: MemberRoleJoin | MemberRoleJoin[],
  moduleKey: string,
  min: PermissionLevel
): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  for (const r of roles) {
    const perms = r?.role_permissions ?? [];
    for (const p of perms) {
      if (p.module_key !== moduleKey) continue;
      if (PERMISSION_LEVEL_RANK[p.level] >= PERMISSION_LEVEL_RANK[min]) return true;
    }
  }
  return false;
}

async function getOrgTeamUserIdsForModule(
  organizationId: string,
  moduleKey: string,
  min: PermissionLevel
): Promise<string[]> {
  const db = adminClient();
  const { data: members } = await db
    .from("organization_members")
    .select("user_id, roles(role_permissions(module_key, level))")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return (members ?? [])
    .filter(m => memberHasModuleAccess(m.roles as MemberRoleJoin | MemberRoleJoin[], moduleKey, min))
    .map(m => String(m.user_id))
    .filter(Boolean);
}

/**
 * user_id de miembros activos de la organización con acceso al inbox
 * (rol con módulo "inbox" ≥ view). Compartido entre el email de handoff
 * (src/lib/email/notify-handoff.ts) y las notificaciones push.
 */
export async function getOrgInboxTeamUserIds(organizationId: string): Promise<string[]> {
  return getOrgTeamUserIdsForModule(organizationId, "inbox", "view");
}

/**
 * user_id de miembros activos con permiso para administrar Conectores
 * (módulo "conectores" ≥ edit) — a quienes se avisa si se cae la conexión
 * de Google Calendar.
 */
export async function getOrgConectoresTeamUserIds(organizationId: string): Promise<string[]> {
  return getOrgTeamUserIdsForModule(organizationId, "conectores", "edit");
}

/**
 * user_id de miembros activos con permiso para administrar ERP > Inventarios
 * (módulo "erp" ≥ manage) — a quienes se avisa cuando un producto toca su
 * stock mínimo y la regla de alerta no tiene destinatarios explícitos.
 */
export async function getOrgErpTeamUserIds(organizationId: string): Promise<string[]> {
  return getOrgTeamUserIdsForModule(organizationId, "erp", "manage");
}
