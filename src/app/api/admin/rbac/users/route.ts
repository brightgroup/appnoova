import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  addOrganizationMember,
  bootstrapOrganization,
  createAuthUser,
  type OrgMemberRoleSlug,
} from "@/lib/admin-provisioning";

const VALID_ROLES = new Set<OrgMemberRoleSlug>(["org_admin", "manager", "advisor", "viewer"]);

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

  const ids = (profiles ?? []).map(p => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const [legacyRes, membersRes] = await Promise.all([
    db.from("users").select("id, nombre, email_confirmed").in("id", ids),
    db
      .from("organization_members")
      .select("user_id, organization_id, status, roles(name, slug), organizations(name, slug)")
      .in("user_id", ids),
  ]);

  const legacyMap = new Map((legacyRes.data ?? []).map(u => [u.id, u]));
  const membersByUser = new Map<string, typeof membersRes.data>();
  for (const m of membersRes.data ?? []) {
    const list = membersByUser.get(m.user_id) ?? [];
    list.push(m);
    membersByUser.set(m.user_id, list);
  }

  return NextResponse.json({
    users: (profiles ?? []).map(p => {
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

/** POST — crear usuario y asignarlo a una organización (o crear org como propietario) */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const fullName = (body.full_name as string | undefined)?.trim() || "";
  const password = (body.password as string | undefined)?.trim();
  const createOrg = body.create_org === true;
  const organizationId = body.organization_id as string | undefined;
  const orgName = (body.org_name as string | undefined)?.trim();
  const roleSlug = (body.role_slug as OrgMemberRoleSlug | undefined) ?? "advisor";

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const db = adminClient();

  try {
    if (createOrg) {
      const name = orgName || fullName || email.split("@")[0];
      const created = await createAuthUser(db, { email, fullName, password });
      const org = await bootstrapOrganization(db, {
        name,
        ownerUserId: created.userId,
        plan: "explorador",
      });

      return NextResponse.json(
        {
          user: { id: created.userId, email, full_name: created.displayName },
          organization_id: org.id,
          temporary_password: created.temporaryPassword,
        },
        { status: 201 }
      );
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Selecciona una organización o marca «Crear nueva organización»" },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.has(roleSlug)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const { data: org } = await db.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    const created = await createAuthUser(db, { email, fullName, password });
    await addOrganizationMember(db, {
      organizationId,
      userId: created.userId,
      roleSlug,
      setActive: true,
    });

    return NextResponse.json(
      {
        user: { id: created.userId, email, full_name: created.displayName },
        organization_id: organizationId,
        role_slug: roleSlug,
        temporary_password: created.temporaryPassword,
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al crear usuario" },
      { status: 400 }
    );
  }
}
