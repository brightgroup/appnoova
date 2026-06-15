import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import type { PermissionLevel } from "@/types/rbac";
import { ORG_PERMISSION_MODULE_KEYS } from "@/types/rbac";

const LEVELS = new Set<PermissionLevel>(["none", "view", "edit", "manage"]);

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "rol_custom";
}

/** GET — plantillas de roles de organización (configurables) */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();

  const { data: roles, error } = await db
    .from("roles")
    .select("*")
    .eq("scope", "organization")
    .eq("is_template", true)
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roleIds = (roles ?? []).map((r) => r.id);
  const { data: perms } = roleIds.length
    ? await db.from("role_permissions").select("role_id, module_key, level").in("role_id", roleIds)
    : { data: [] };

  const { data: modules } = await db
    .from("permission_modules")
    .select("*")
    .eq("scope", "organization")
    .eq("is_active", true)
    .order("sort_order");

  const permMap = new Map<string, Record<string, PermissionLevel>>();
  for (const p of perms ?? []) {
    if (!permMap.has(p.role_id)) permMap.set(p.role_id, {});
    permMap.get(p.role_id)![p.module_key] = p.level as PermissionLevel;
  }

  return NextResponse.json({
    roles: (roles ?? []).map((r) => ({
      ...r,
      permissions: permMap.get(r.id) ?? {},
    })),
    modules: modules ?? [],
  });
}

/** POST — crear plantilla de rol custom */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const description = (body.description as string | undefined)?.trim() || null;
  const permissions = (body.permissions ?? {}) as Record<string, PermissionLevel>;

  if (!name) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const slug = slugify(body.slug as string || name);
  const db = adminClient();

  const { data: existing } = await db
    .from("roles")
    .select("id")
    .eq("is_template", true)
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Ya existe un rol con ese identificador" }, { status: 409 });
  }

  const { data: role, error } = await db
    .from("roles")
    .insert({
      scope: "organization",
      organization_id: null,
      slug,
      name,
      description,
      is_system: false,
      is_template: true,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const permRows = ORG_PERMISSION_MODULE_KEYS.map((key) => ({
    role_id: role.id,
    module_key: key,
    level: LEVELS.has(permissions[key]) ? permissions[key] : "none",
  }));

  await db.from("role_permissions").insert(permRows);
  await db.rpc("sync_role_template_permissions", { p_template_id: role.id });

  return NextResponse.json({ role: { ...role, permissions } }, { status: 201 });
}
