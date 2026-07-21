import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { deleteUserCompletely, updateOrgMemberProfile } from "@/lib/admin-provisioning";
import { adminClient } from "@/lib/voice-agents-server";
import type { AccountStatus } from "@/types/rbac";

const VALID_STATUS = new Set<AccountStatus>(["active", "invited", "suspended", "disabled"]);
const MIN_PASSWORD_LENGTH = 6;

/** PATCH — editar usuario (nombre, estado, contraseña) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const password =
    typeof body.password === "string" ? body.password.trim() : "";

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 }
    );
  }

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
  let hasProfileChange = false;

  if (typeof body.full_name === "string") {
    profileUpdates.full_name = body.full_name.trim() || null;
    legacyUpdates.nombre = body.full_name.trim() || null;
    hasProfileChange = true;
  }

  if (body.status && VALID_STATUS.has(body.status) && !(await isProtectedUser(userId))) {
    profileUpdates.status = body.status;
    legacyUpdates.status = body.status;
    hasProfileChange = true;
    await db
      .from("organization_members")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  if (!hasProfileChange && !password) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  if (password) {
    try {
      await updateOrgMemberProfile(db, userId, { password });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cambiar la contraseña";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!hasProfileChange) {
    const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
    return NextResponse.json({ user: data, password_updated: true });
  }

  const { data, error } = await db
    .from("profiles")
    .update(profileUpdates)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("users").update(legacyUpdates).eq("id", userId);

  return NextResponse.json({ user: data, password_updated: Boolean(password) });
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
    if (await isProtectedUser(org.owner_user_id)) {
      return NextResponse.json(
        { error: "No se puede eliminar un usuario con organización protegida del superadministrador" },
        { status: 403 }
      );
    }
  }

  try {
    await deleteUserCompletely(db, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
