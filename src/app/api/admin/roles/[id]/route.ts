import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import type { PermissionLevel } from "@/types/rbac";
import { ORG_ROLE_UI_MODULE_KEYS } from "@/types/rbac";

const LEVELS = new Set<PermissionLevel>(["none", "view", "edit", "manage"]);

/** PATCH — editar plantilla de rol y propagar a organizaciones */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const { data: role, error: roleErr } = await db
    .from("roles")
    .select("*")
    .eq("id", id)
    .eq("is_template", true)
    .maybeSingle();

  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
  if (!role) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;

  if (Object.keys(updates).length > 1) {
    const { error } = await db.from("roles").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.permissions && typeof body.permissions === "object") {
    const permissions = body.permissions as Record<string, PermissionLevel>;
    for (const key of ORG_ROLE_UI_MODULE_KEYS) {
      const level = LEVELS.has(permissions[key]) ? permissions[key] : "none";
      await db.from("role_permissions").upsert({
        role_id: id,
        module_key: key,
        level,
      });
    }
    await db.rpc("sync_role_template_permissions", { p_template_id: id });
  }

  const { data: updated } = await db.from("roles").select("*").eq("id", id).single();
  const { data: perms } = await db
    .from("role_permissions")
    .select("module_key, level")
    .eq("role_id", id);

  const permMap: Record<string, PermissionLevel> = {};
  for (const p of perms ?? []) permMap[p.module_key] = p.level as PermissionLevel;

  return NextResponse.json({ role: { ...updated, permissions: permMap } });
}

/** DELETE — eliminar plantilla custom (no roles de sistema) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const db = adminClient();

  const { data: role } = await db
    .from("roles")
    .select("is_system, slug")
    .eq("id", id)
    .eq("is_template", true)
    .maybeSingle();

  if (!role) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });
  if (role.is_system) {
    return NextResponse.json({ error: "No se pueden eliminar roles de sistema" }, { status: 403 });
  }

  const { count } = await db
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .in(
      "role_id",
      (
        await db.from("roles").select("id").eq("slug", role.slug).eq("is_template", false)
      ).data?.map((r) => r.id) ?? []
    );

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Hay usuarios con este rol. Reasígnalos antes de eliminar." },
      { status: 409 }
    );
  }

  await db.from("roles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
