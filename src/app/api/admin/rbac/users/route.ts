import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { adminClient, userDisplayName } from "@/lib/voice-agents-server";
import { isSuperAdminEmail } from "@/lib/rbac-constants";
import { uniqueOrgSlug } from "@/lib/admin-utils";
import type { AccountStatus } from "@/types/rbac";

const VALID_STATUS = new Set<AccountStatus>(["active", "invited", "suspended", "disabled"]);

async function provisionCustomerAccount(
  db: ReturnType<typeof adminClient>,
  userId: string,
  email: string,
  fullName: string
) {
  await db.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    status: "active",
    is_platform_admin: false,
    is_protected: false,
  });

  await db.from("users").upsert({
    id: userId,
    email,
    nombre: fullName,
    rol: "user",
    status: "active",
    is_platform_admin: false,
  });

  const orgName = fullName ? `${fullName} — Org` : `${email.split("@")[0]} — Org`;
  const slug = await uniqueOrgSlug(db, email.split("@")[0] || userId.slice(0, 8));

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({
      name: orgName,
      slug,
      owner_user_id: userId,
      status: "active",
      plan: "trial",
    })
    .select("id")
    .single();

  if (orgErr) throw new Error(orgErr.message);

  await db.rpc("seed_organization_system_roles", { p_org_id: org.id });

  const { data: ownerRole } = await db
    .from("roles")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", "owner")
    .single();

  if (ownerRole) {
    await db.from("organization_members").upsert({
      organization_id: org.id,
      user_id: userId,
      role_id: ownerRole.id,
      status: "active",
    });
  }

  await db.from("user_active_organization").upsert({
    user_id: userId,
    organization_id: org.id,
  });

  await db.from("users").update({ organization_id: org.id }).eq("id", userId);

  return org.id;
}

/** GET — perfiles con membresías */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();

  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, email, full_name, status, is_protected, is_platform_admin, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const [legacyRes, membersRes] = await Promise.all([
    db.from("users").select("id, nombre, email_confirmed").in("id", ids),
    db
      .from("organization_members")
      .select("user_id, organization_id, status, roles(name), organizations(name)")
      .in("user_id", ids),
  ]);

  const legacyMap = new Map((legacyRes.data ?? []).map((u) => [u.id, u]));
  const membersByUser = new Map<string, typeof membersRes.data>();
  for (const m of membersRes.data ?? []) {
    const list = membersByUser.get(m.user_id) ?? [];
    list.push(m);
    membersByUser.set(m.user_id, list);
  }

  return NextResponse.json({
    users: (profiles ?? []).map((p) => {
      const legacy = legacyMap.get(p.id);
      return {
        ...p,
        nombre: legacy?.nombre ?? p.full_name,
        email_confirmed: legacy?.email_confirmed ?? true,
        is_super_admin: p.is_protected === true,
        memberships: membersByUser.get(p.id) ?? [],
      };
    }),
  });
}

/** POST — crear usuario (+ organización opcional) */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const fullName = (body.full_name as string | undefined)?.trim() || "";
  const password = (body.password as string | undefined)?.trim();
  const createOrg = body.create_org !== false;

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  if (isSuperAdminEmail(email)) {
    return NextResponse.json({ error: "Email reservado para superadministrador" }, { status: 403 });
  }

  const db = adminClient();

  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
  }

  const tempPassword = password || crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "Aa1!";

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0] },
  });

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "No se pudo crear usuario" }, { status: 400 });
  }

  const userId = created.user.id;
  const displayName = fullName || userDisplayName(created.user);

  try {
    let organizationId: string | null = null;
    if (createOrg) {
      organizationId = await provisionCustomerAccount(db, userId, email, displayName);
    } else {
      await db.from("profiles").upsert({
        id: userId,
        email,
        full_name: displayName,
        status: "active",
      });
      await db.from("users").upsert({
        id: userId,
        email,
        nombre: displayName,
        rol: "user",
        status: "active",
      });
    }

    return NextResponse.json(
      {
        user: { id: userId, email, full_name: displayName },
        organization_id: organizationId,
        temporary_password: password ? undefined : tempPassword,
      },
      { status: 201 }
    );
  } catch (e) {
    await db.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al aprovisionar cuenta" },
      { status: 500 }
    );
  }
}
