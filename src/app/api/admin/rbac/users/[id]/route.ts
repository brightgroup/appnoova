import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import type { AccountStatus } from "@/types/rbac";

const VALID_STATUS = new Set<AccountStatus>(["active", "invited", "suspended", "disabled"]);

/** PATCH — editar usuario (nombre, estado) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));

  if (await isProtectedUser(userId)) {
    if (body.status && body.status !== "active") {
      return NextResponse.json(
        { error: "El superadministrador no puede suspenderse ni desactivarse" },
        { status: 403 }
      );
    }
  } else if (body.status && !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const db = adminClient();
  const profileUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const legacyUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.full_name === "string") {
    profileUpdates.full_name = body.full_name.trim() || null;
    legacyUpdates.nombre = body.full_name.trim() || null;
  }

  if (body.status && VALID_STATUS.has(body.status) && !(await isProtectedUser(userId))) {
    profileUpdates.status = body.status;
    legacyUpdates.status = body.status;
    await db
      .from("organization_members")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  if (Object.keys(profileUpdates).length <= 1) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await db
    .from("profiles")
    .update(profileUpdates)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("users").update(legacyUpdates).eq("id", userId);

  return NextResponse.json({ user: data });
}

/** DELETE — eliminar usuario y sus organizaciones propias */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id: userId } = await params;

  if (await isProtectedUser(userId)) {
    return NextResponse.json(
      { error: "No se puede eliminar al superadministrador" },
      { status: 403 }
    );
  }

  if (userId === auth.userId) {
    return NextResponse.json({ error: "No puedes eliminar tu propia sesión" }, { status: 403 });
  }

  const db = adminClient();

  const { data: ownedOrgs } = await db
    .from("organizations")
    .select("id, owner_user_id")
    .eq("owner_user_id", userId);

  for (const org of ownedOrgs ?? []) {
    if (await isProtectedUser(org.owner_user_id)) continue;
    await db.from("organizations").delete().eq("id", org.id);
  }

  await db.from("organization_members").delete().eq("user_id", userId);
  await db.from("platform_role_assignments").delete().eq("user_id", userId);
  await db.from("user_active_organization").delete().eq("user_id", userId);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
