/** RBAC multitenant — alineado con supabase/migrations/033_multitenant_rbac.sql */

export type AccountStatus = "active" | "invited" | "suspended" | "disabled";

export type PermissionLevel = "none" | "view" | "edit" | "manage";

export type RoleScope = "platform" | "organization";

export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "Ninguno",
  view: "Ver",
  edit: "Editar",
  manage: "Administrar",
};

/** Módulos de organización (UI de roles — como el modal de referencia) */
export const ORG_PERMISSION_MODULE_KEYS = [
  "voice_agents",
  "text_agents",
  "inbox",
  "crm",
  "campaigns",
  "flow_studio",
  "channels",
  "whatsapp",
  "telephony",
  "billing",
  "company_context",
  "org_users",
] as const;

export type OrgPermissionModuleKey = (typeof ORG_PERMISSION_MODULE_KEYS)[number];

export const ORG_MODULE_LABELS: Record<OrgPermissionModuleKey, string> = {
  voice_agents: "Agentes de voz",
  text_agents: "Agentes de texto",
  inbox: "Inbox",
  crm: "CRM",
  campaigns: "Campañas",
  flow_studio: "Flow Studio",
  channels: "Canales",
  whatsapp: "WhatsApp",
  telephony: "Telefonía",
  billing: "Facturación",
  company_context: "Contextos de marca",
  org_users: "Usuarios org",
};

/** Roles de sistema por organización */
export const ORG_SYSTEM_ROLE_SLUGS = [
  "owner",
  "org_admin",
  "manager",
  "advisor",
  "viewer",
] as const;

export type OrgSystemRoleSlug = (typeof ORG_SYSTEM_ROLE_SLUGS)[number];

export const ORG_SYSTEM_ROLE_LABELS: Record<OrgSystemRoleSlug, string> = {
  owner: "Propietario",
  org_admin: "Administrador",
  manager: "Gerente",
  advisor: "Asesor",
  viewer: "Solo lectura",
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  status: AccountStatus;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_platform_admin: boolean;
  is_protected?: boolean;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface PermissionModule {
  key: string;
  label: string;
  description: string | null;
  scope: RoleScope;
  sort_order: number;
  is_active: boolean;
}

export interface Role {
  id: string;
  scope: RoleScope;
  organization_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_template?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  role_id: string;
  module_key: string;
  level: PermissionLevel;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  status: AccountStatus;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string;
  updated_at: string;
}

export function hasMinPermission(
  level: PermissionLevel,
  min: PermissionLevel
): boolean {
  return PERMISSION_LEVEL_RANK[level] >= PERMISSION_LEVEL_RANK[min];
}

export function countActivePermissions(
  permissions: Record<string, PermissionLevel>
): number {
  return Object.values(permissions).filter((l) => l !== "none").length;
}
