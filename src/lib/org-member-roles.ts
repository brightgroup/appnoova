import {
  ORG_ADMIN_ASSIGNABLE_ROLE_SLUGS,
  ORG_OWNER_ASSIGNABLE_ROLE_SLUGS,
} from "@/types/rbac";

const ORG_ADMIN_SET = new Set<string>(ORG_ADMIN_ASSIGNABLE_ROLE_SLUGS);
const ORG_OWNER_SET = new Set<string>(ORG_OWNER_ASSIGNABLE_ROLE_SLUGS);

/** Slugs de roles que el usuario actual puede asignar en su organización. */
export function assignableRoleSlugsForCaller(callerRoleSlug: string | undefined): string[] {
  if (callerRoleSlug === "owner") return [...ORG_OWNER_ASSIGNABLE_ROLE_SLUGS];
  if (callerRoleSlug === "org_admin") return [...ORG_ADMIN_ASSIGNABLE_ROLE_SLUGS];
  return [];
}

export function canAssignOrgRole(callerRoleSlug: string | undefined, targetRoleSlug: string): boolean {
  if (targetRoleSlug === "owner") return false;
  if (callerRoleSlug === "owner") return ORG_OWNER_SET.has(targetRoleSlug);
  if (callerRoleSlug === "org_admin") return ORG_ADMIN_SET.has(targetRoleSlug);
  return false;
}
