import type { PermissionLevel, OrgPermissionModuleKey } from "@/types/rbac";
import { ORG_PERMISSION_MODULE_KEYS, hasMinPermission } from "@/types/rbac";

export type OrgPermissionsMap = Record<OrgPermissionModuleKey, PermissionLevel>;

export function emptyOrgPermissions(): OrgPermissionsMap {
  return Object.fromEntries(
    ORG_PERMISSION_MODULE_KEYS.map((k) => [k, "none" as PermissionLevel])
  ) as OrgPermissionsMap;
}

export function canAccessModule(
  permissions: OrgPermissionsMap | Record<string, PermissionLevel>,
  module: OrgPermissionModuleKey,
  min: PermissionLevel = "view"
): boolean {
  const level = permissions[module] ?? "none";
  return hasMinPermission(level, min);
}

export interface DashboardRouteRule {
  module: OrgPermissionModuleKey;
  min: PermissionLevel;
}

/** Reglas por prefijo de ruta (más específico primero). */
export const DASHBOARD_ROUTE_RULES: { prefix: string; rule: DashboardRouteRule }[] = [
  { prefix: "/dashboard/facturacion", rule: { module: "billing", min: "view" } },
  { prefix: "/dashboard/equipo", rule: { module: "org_users", min: "view" } },
  { prefix: "/dashboard/inbox", rule: { module: "inbox", min: "view" } },
  { prefix: "/dashboard/agentes-texto", rule: { module: "text_agents", min: "view" } },
  { prefix: "/dashboard/agentes-voz", rule: { module: "voice_agents", min: "view" } },
  { prefix: "/dashboard/crm", rule: { module: "crm", min: "view" } },
  { prefix: "/dashboard/campaigns", rule: { module: "campaigns", min: "view" } },
  { prefix: "/dashboard/canales", rule: { module: "channels", min: "view" } },
  { prefix: "/dashboard/conectores", rule: { module: "conectores", min: "view" } },
  { prefix: "/dashboard/workflows", rule: { module: "workflows", min: "view" } },
  { prefix: "/dashboard/micrositio", rule: { module: "channels", min: "view" } },
  { prefix: "/dashboard/contextos", rule: { module: "company_context", min: "view" } },
  { prefix: "/dashboard/tablas", rule: { module: "campaigns", min: "view" } },
  { prefix: "/dashboard/erp", rule: { module: "erp", min: "view" } },
];

export function routeRuleForPath(pathname: string): DashboardRouteRule | null {
  for (const { prefix, rule } of DASHBOARD_ROUTE_RULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return rule;
    }
  }
  return null;
}

export function canAccessDashboardPath(
  permissions: OrgPermissionsMap | Record<string, PermissionLevel>,
  pathname: string
): boolean {
  const rule = routeRuleForPath(pathname);
  if (!rule) return true;
  return canAccessModule(permissions, rule.module, rule.min);
}

/** Flags de conveniencia para UI */
export function buildPermissionFlags(permissions: OrgPermissionsMap) {
  return {
    can_view_billing: canAccessModule(permissions, "billing", "view"),
    can_edit_billing: canAccessModule(permissions, "billing", "edit"),
    can_view_team: canAccessModule(permissions, "org_users", "view"),
    can_manage_team: canAccessModule(permissions, "org_users", "edit"),
    can_admin_team: canAccessModule(permissions, "org_users", "manage"),
    can_view_inbox: canAccessModule(permissions, "inbox", "view"),
    can_edit_inbox: canAccessModule(permissions, "inbox", "edit"),
    can_view_text_agents: canAccessModule(permissions, "text_agents", "view"),
    can_edit_text_agents: canAccessModule(permissions, "text_agents", "edit"),
    can_view_voice_agents: canAccessModule(permissions, "voice_agents", "view"),
    can_edit_voice_agents: canAccessModule(permissions, "voice_agents", "edit"),
    can_view_crm: canAccessModule(permissions, "crm", "view"),
    can_edit_crm: canAccessModule(permissions, "crm", "edit"),
    can_view_campaigns: canAccessModule(permissions, "campaigns", "view"),
    can_edit_campaigns: canAccessModule(permissions, "campaigns", "edit"),
    can_view_channels: canAccessModule(permissions, "channels", "view"),
    can_edit_channels: canAccessModule(permissions, "channels", "edit"),
    can_view_conectores: canAccessModule(permissions, "conectores", "view"),
    can_edit_conectores: canAccessModule(permissions, "conectores", "edit"),
    can_view_workflows: canAccessModule(permissions, "workflows", "view"),
    can_edit_workflows: canAccessModule(permissions, "workflows", "edit"),
    can_view_contexts: canAccessModule(permissions, "company_context", "view"),
    can_edit_contexts: canAccessModule(permissions, "company_context", "edit"),
    can_view_erp: canAccessModule(permissions, "erp", "view"),
    can_edit_erp: canAccessModule(permissions, "erp", "edit"),
    can_manage_erp: canAccessModule(permissions, "erp", "manage"),
  };
}
