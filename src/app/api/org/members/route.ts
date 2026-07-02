import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest, getOrgRoleById } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";
import { createAuthUser } from "@/lib/admin-provisioning";
import { getAgencyAccessLoginUrl } from "@/lib/agency-access-url";
import { assertOrgHasAvailableSeat, getOrgSeatSnapshot } from "@/lib/org-seats";
import { canAssignOrgRole } from "@/lib/org-member-roles";
import type { AccountStatus } from "@/types/rbac";
import { isSuperAdminEmail } from "@/lib/rbac-constants";

const VALID_STATUS = new Set<AccountStatus>(["active", "invited", "suspended", "disabled"]);

function relOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** GET — miembros e invitaciones pendientes */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req, { module: "org_users", minLevel: "view" });
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();

  const [{ data: members, error: memErr }, { data: invites, error: invErr }] = await Promise.all([
    db
      .from("organization_members")
      .select("id, user_id, role_id, status, joined_at, roles(id, slug, name)")
      .eq("organization_id", ctx.organizationId)
      .order("joined_at", { ascending: true }),
    db
      .from("organization_invites")
      .select("id, email, role_id, created_at, expires_at, roles(slug, name)")
      .eq("organization_id", ctx.organizationId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await db.from("profiles").select("id, email, full_name, avatar_url, is_protected").in("id", userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const seats = await getOrgSeatSnapshot(db, ctx.organizationId);
  const { data: subRow } = await db
    .from("organization_subscriptions")
    .select("plan_id, plans(name)")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const planRaw = subRow?.plans as { name: string } | { name: string }[] | null;
  const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;

  return NextResponse.json({
    plan: {
      id: subRow?.plan_id ?? seats.planId,
      name: plan?.name ?? null,
      max_users: seats.max,
    },
    seats: {
      used: seats.used,
      max: seats.max,
      remaining: seats.remaining,
    },
    members: (members ?? []).map((m) => {
      const profile = profileMap.get(m.user_id);
      const roleRaw = m.roles as { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null;
      const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
      return {
        id: m.id,
        user_id: m.user_id,
        email: profile?.email ?? "",
        full_name: profile?.full_name,
        avatar_url: profile?.avatar_url,
        status: m.status,
        joined_at: m.joined_at,
        role_id: m.role_id,
        role_slug: role?.slug,
        role_name: role?.name,
        is_owner: role?.slug === "owner",
        is_self: m.user_id === ctx.userId,
      };
    }),
    invites: (invites ?? []).map((i) => {
      const roleRaw = i.roles as { name: string } | { name: string }[] | null;
      const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
      return {
        id: i.id,
        email: i.email,
        role_id: i.role_id,
        role_name: role?.name,
        created_at: i.created_at,
        expires_at: i.expires_at,
      };
    }),
  });
}

/** POST — crear o agregar miembro por email (respeta cupos del plan) */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req, { module: "org_users", minLevel: "edit" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const roleId = body.role_id as string | undefined;
  const fullName = (body.full_name as string | undefined)?.trim() || null;
  const password = (body.password as string | undefined)?.trim() || undefined;

  if (!email || !roleId) {
    return NextResponse.json({ error: "Email y rol requeridos" }, { status: 400 });
  }

  if (isSuperAdminEmail(email)) {
    return NextResponse.json({ error: "No se puede agregar al superadministrador de plataforma" }, { status: 403 });
  }

  const db = adminClient();

  const seatCheck = await assertOrgHasAvailableSeat(db, ctx.organizationId);
  if (seatCheck.ok === false) {
    return NextResponse.json(
      { error: seatCheck.message, seats: seatCheck.seats },
      { status: 403 }
    );
  }

  const role = await getOrgRoleById(db, ctx.organizationId, roleId);
  if (!role || role.slug === "owner") {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  if (!canAssignOrgRole(ctx.membership.role_slug, role.slug)) {
    return NextResponse.json(
      { error: "Tu rol no puede asignar ese tipo de usuario. Solo Gerente, Asesor o Solo lectura." },
      { status: 403 }
    );
  }

  const { data: existingProfile } = await db
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMember } = await db
      .from("organization_members")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: "Este usuario ya es miembro de la organización" }, { status: 409 });
    }

    const { data: member, error } = await db
      .from("organization_members")
      .insert({
        organization_id: ctx.organizationId,
        user_id: existingProfile.id,
        role_id: roleId,
        status: "active",
        invited_by: ctx.userId,
        invited_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (fullName && !existingProfile.full_name) {
      await db.from("profiles").update({ full_name: fullName }).eq("id", existingProfile.id);
    }

    await db.from("user_active_organization").upsert({
      user_id: existingProfile.id,
      organization_id: ctx.organizationId,
    });
    await db.from("users").update({ organization_id: ctx.organizationId }).eq("id", existingProfile.id);

    return NextResponse.json(
      {
        member_id: member.id,
        status: "added",
        message: "Usuario agregado al equipo. Puede ingresar con su cuenta existente.",
        login_url: getAgencyAccessLoginUrl(),
      },
      { status: 201 }
    );
  }

  try {
    const created = await createAuthUser(db, {
      email,
      fullName: fullName ?? undefined,
      password,
    });

    const { data: member, error } = await db
      .from("organization_members")
      .insert({
        organization_id: ctx.organizationId,
        user_id: created.userId,
        role_id: roleId,
        status: "active",
        invited_by: ctx.userId,
        invited_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from("user_active_organization").upsert({
      user_id: created.userId,
      organization_id: ctx.organizationId,
    });
    await db.from("users").update({ organization_id: ctx.organizationId }).eq("id", created.userId);

    await db
      .from("organization_invites")
      .delete()
      .eq("organization_id", ctx.organizationId)
      .ilike("email", email);

    const loginUrl = getAgencyAccessLoginUrl();
    const name = fullName || created.displayName || email.split("@")[0];

    return NextResponse.json(
      {
        member_id: member.id,
        status: "created",
        email,
        temporary_password: created.temporaryPassword,
        login_url: loginUrl,
        message: created.temporaryPassword
          ? `Usuario ${name} creado. Comparte el acceso ${loginUrl} con correo ${email} y contraseña temporal.`
          : `Usuario ${name} creado. Puede ingresar en ${loginUrl}.`,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear el usuario";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** PATCH — actualizar rol o estado de un miembro */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const memberId = body.member_id as string | undefined;
  const roleId = body.role_id as string | undefined;
  const status = body.status as AccountStatus | undefined;

  const minLevel = status && status !== "active" ? "manage" : "edit";
  const ctx = await getOrgContextFromRequest(req, { module: "org_users", minLevel });
  if (ctx instanceof NextResponse) return ctx;

  if (!memberId) {
    return NextResponse.json({ error: "member_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: target } = await db
    .from("organization_members")
    .select("id, user_id, role_id, status, roles(slug)")
    .eq("id", memberId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }

  const { data: targetProfile } = await db
    .from("profiles")
    .select("email, is_protected")
    .eq("id", target.user_id)
    .maybeSingle();

  const targetRole = relOne(target.roles as { slug: string } | { slug: string }[] | null);

  if (targetRole?.slug === "owner" && ctx.membership.role_slug !== "owner") {
    return NextResponse.json({ error: "Solo el propietario puede modificar al propietario" }, { status: 403 });
  }

  if (targetProfile?.is_protected || isSuperAdminEmail(targetProfile?.email)) {
    return NextResponse.json({ error: "Este usuario no puede modificarse" }, { status: 403 });
  }

  if (target.user_id === ctx.userId && status && status !== "active") {
    return NextResponse.json({ error: "No puedes suspenderte a ti mismo" }, { status: 403 });
  }

  if (status === "active" && target.status !== "active") {
    const seatCheck = await assertOrgHasAvailableSeat(db, ctx.organizationId);
    if (seatCheck.ok === false) {
      return NextResponse.json({ error: seatCheck.message, seats: seatCheck.seats }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (roleId) {
    const role = await getOrgRoleById(db, ctx.organizationId, roleId);
    if (!role || role.slug === "owner") {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    if (targetRole?.slug === "owner") {
      return NextResponse.json({ error: "No se puede cambiar el rol del propietario" }, { status: 403 });
    }
    if (!canAssignOrgRole(ctx.membership.role_slug, role.slug)) {
      return NextResponse.json({ error: "Tu rol no puede asignar ese tipo de usuario" }, { status: 403 });
    }
    updates.role_id = roleId;
  }

  if (status) {
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    updates.status = status;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await db
    .from("organization_members")
    .update(updates)
    .eq("id", memberId)
    .select("id, user_id, role_id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

/** DELETE — quitar miembro o cancelar invitación */
export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req, { module: "org_users", minLevel: "manage" });
  if (ctx instanceof NextResponse) return ctx;

  const memberId = new URL(req.url).searchParams.get("member_id");
  const inviteId = new URL(req.url).searchParams.get("invite_id");

  const db = adminClient();

  if (inviteId) {
    await db.from("organization_invites").delete().eq("id", inviteId).eq("organization_id", ctx.organizationId);
    return NextResponse.json({ ok: true });
  }

  if (!memberId) {
    return NextResponse.json({ error: "member_id o invite_id requerido" }, { status: 400 });
  }

  const { data: target } = await db
    .from("organization_members")
    .select("id, user_id, roles(slug)")
    .eq("id", memberId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  const { data: profile } = await db
    .from("profiles")
    .select("is_protected, email")
    .eq("id", target.user_id)
    .maybeSingle();

  const slug = relOne(target.roles as { slug: string } | { slug: string }[] | null)?.slug;

  if (slug === "owner") {
    return NextResponse.json({ error: "No se puede eliminar al propietario" }, { status: 403 });
  }
  if (profile?.is_protected || isSuperAdminEmail(profile?.email)) {
    return NextResponse.json({ error: "Este usuario no puede eliminarse" }, { status: 403 });
  }
  if (target.user_id === ctx.userId) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 403 });
  }

  await db.from("organization_members").delete().eq("id", memberId);
  return NextResponse.json({ ok: true });
}
