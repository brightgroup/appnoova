/** Superadmin principal — no suspendible, único acceso a /admin */
export const SUPERADMIN_EMAIL = "admin@noova360.com";

export const SUPER_ADMIN_ROLE_ID = "00000000-0000-4000-a000-000000000001";

/** Plantillas de roles de organización (configurables en /admin/roles) */
export const ORG_ROLE_TEMPLATE_IDS = {
  org_admin: "00000000-0000-4000-b000-000000000001",
  manager: "00000000-0000-4000-b000-000000000002",
  advisor: "00000000-0000-4000-b000-000000000003",
  viewer: "00000000-0000-4000-b000-000000000004",
} as const;

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SUPERADMIN_EMAIL;
}
