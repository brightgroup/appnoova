import { adminClient, userDisplayName } from "@/lib/voice-agents-server";
import { uniqueOrgSlug } from "@/lib/admin-utils";
import { mergeOrgBrandingSettings } from "@/lib/org-branding";
import { isSuperAdminEmail } from "@/lib/rbac-constants";

export type OrgMemberRoleSlug = "owner" | "org_admin" | "manager" | "advisor" | "viewer";

const VALID_PLANS = new Set(["explorador", "basico", "esencial", "crecimiento", "escala"]);
const VALID_MEMBER_ROLES = new Set<OrgMemberRoleSlug>([
  "owner",
  "org_admin",
  "manager",
  "advisor",
  "viewer",
]);

type Db = ReturnType<typeof adminClient>;

export async function ensureUserProfile(
  db: Db,
  userId: string,
  email: string,
  fullName: string,
  status: "active" | "invited" | "suspended" | "disabled" = "active"
) {
  await db.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    status,
    is_platform_admin: false,
    is_protected: false,
  });

  await db.from("users").upsert({
    id: userId,
    email,
    nombre: fullName,
    rol: "user",
    status,
    is_platform_admin: false,
  });
}

export async function createAuthUser(
  db: Db,
  input: { email: string; fullName?: string; password?: string }
): Promise<{ userId: string; displayName: string; temporaryPassword?: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() ?? "";

  if (!email) throw new Error("Email requerido");
  if (isSuperAdminEmail(email)) throw new Error("Email reservado para superadministrador");

  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) throw new Error("Ya existe un usuario con ese email");

  const tempPassword =
    input.password?.trim() ||
    crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "Aa1!";

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0] },
  });

  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "No se pudo crear usuario");
  }

  const displayName = fullName || userDisplayName(created.user);
  await ensureUserProfile(db, created.user.id, email, displayName);

  return {
    userId: created.user.id,
    displayName,
    temporaryPassword: input.password?.trim() ? undefined : tempPassword,
  };
}

export async function resolveUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("id").ilike("email", email.trim().toLowerCase()).maybeSingle();
  return data?.id ?? null;
}

export async function bootstrapOrganization(
  db: Db,
  input: {
    name: string;
    ownerUserId: string;
    plan?: string;
    slug?: string;
    hideNoovaLogo?: boolean;
  }
): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  const plan = input.plan?.trim() || "explorador";
  if (!name) throw new Error("Nombre de organización requerido");
  if (!VALID_PLANS.has(plan)) {
    const { data: row } = await db.from("plans").select("id").eq("id", plan).eq("is_active", true).maybeSingle();
    if (!row) throw new Error("Plan inválido");
  }

  const slug = input.slug
    ? await uniqueOrgSlug(db, input.slug)
    : await uniqueOrgSlug(db, name);

  const settings =
    input.hideNoovaLogo === true
      ? mergeOrgBrandingSettings({}, { hide_noova_logo: true })
      : {};

  const { data: org, error } = await db
    .from("organizations")
    .insert({
      name,
      slug,
      owner_user_id: input.ownerUserId,
      status: "active",
      plan,
      settings,
    })
    .select("id, slug")
    .single();

  if (error) throw new Error(error.message);

  await db.rpc("seed_organization_system_roles", { p_org_id: org.id });
  await addOrganizationMember(db, {
    organizationId: org.id,
    userId: input.ownerUserId,
    roleSlug: "owner",
    setActive: true,
  });

  const { error: billingErr } = await db.rpc("billing_bootstrap_subscription", {
    p_org: org.id,
    p_plan: plan,
  });
  if (billingErr) {
    console.error("[admin-provisioning] bootstrap billing:", billingErr.message);
  }

  await db.from("users").update({ organization_id: org.id }).eq("id", input.ownerUserId);

  return { id: org.id, slug: org.slug };
}

export async function addOrganizationMember(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    roleSlug?: OrgMemberRoleSlug;
    setActive?: boolean;
  }
) {
  const roleSlug = input.roleSlug ?? "advisor";
  if (!VALID_MEMBER_ROLES.has(roleSlug)) throw new Error("Rol inválido");

  const { data: role } = await db
    .from("roles")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("slug", roleSlug)
    .maybeSingle();

  if (!role) throw new Error(`Rol «${roleSlug}» no encontrado en la organización`);

  await db.from("organization_members").upsert({
    organization_id: input.organizationId,
    user_id: input.userId,
    role_id: role.id,
    status: "active",
    updated_at: new Date().toISOString(),
  });

  if (input.setActive !== false) {
    await db.from("user_active_organization").upsert({
      user_id: input.userId,
      organization_id: input.organizationId,
    });
    await db.from("users").update({ organization_id: input.organizationId }).eq("id", input.userId);
  }
}

/** Elimina una organización y desbloquea FKs (members→roles RESTRICT, users.organization_id). */
export async function deleteOrganizationCompletely(db: Db, orgId: string): Promise<void> {
  await db.from("organization_members").delete().eq("organization_id", orgId);
  await db.from("organization_invites").delete().eq("organization_id", orgId);
  await db.from("user_active_organization").delete().eq("organization_id", orgId);
  await db.from("users").update({ organization_id: null }).eq("organization_id", orgId);

  const { error } = await db.from("organizations").delete().eq("id", orgId);
  if (error) throw new Error(error.message);
}

/** Elimina un usuario de auth tras limpiar orgs propias y referencias bloqueantes. */
export async function deleteUserCompletely(db: Db, userId: string): Promise<void> {
  const { data: ownedOrgs } = await db
    .from("organizations")
    .select("id")
    .eq("owner_user_id", userId);

  for (const org of ownedOrgs ?? []) {
    await deleteOrganizationCompletely(db, org.id);
  }

  await db.from("organization_invites").delete().eq("invited_by", userId);
  await db.from("platform_role_assignments").update({ assigned_by: null }).eq("assigned_by", userId);
  await db.from("phone_numbers").update({ assigned_by: null }).eq("assigned_by", userId);
  await db.from("organization_members").delete().eq("user_id", userId);
  await db.from("platform_role_assignments").delete().eq("user_id", userId);
  await db.from("user_active_organization").delete().eq("user_id", userId);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
