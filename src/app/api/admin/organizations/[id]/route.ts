import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { deleteOrganizationCompletely } from "@/lib/admin-provisioning";
import { adminClient } from "@/lib/voice-agents-server";
import { uniqueOrgSlug } from "@/lib/admin-utils";
import type { AccountStatus } from "@/types/rbac";

const VALID_STATUS = new Set<AccountStatus>(["active", "invited", "suspended", "disabled"]);
const PLANS = new Set(["explorador", "basico", "esencial", "crecimiento", "escala"]);

/** PATCH — editar organización (nombre, slug, plan, estado) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const { data: org } = await db.from("organizations").select("owner_user_id").eq("id", id).maybeSingle();
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  const isProtectedOrg = await isProtectedUser(org.owner_user_id);

  if (body.status && isProtectedOrg && body.status !== "active") {
    return NextResponse.json(
      { error: "No se puede suspender la organización del superadministrador" },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    updates.slug = await uniqueOrgSlug(db, body.slug.trim(), id);
  }

  if (typeof body.plan === "string" && PLANS.has(body.plan)) {
    updates.plan = body.plan;
  }

  if (body.status && VALID_STATUS.has(body.status)) {
    updates.status = body.status;
    if (body.status === "suspended" || body.status === "disabled") {
      await db
        .from("organization_members")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("organization_id", id);
    } else if (body.status === "active") {
      await db
        .from("organization_members")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("organization_id", id);
    }
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await db
    .from("organizations")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si cambió el plan, re-crear suscripción + billetera (reinicia créditos del periodo)
  if (typeof updates.plan === "string") {
    const { error: billingErr } = await db.rpc("billing_bootstrap_subscription", {
      p_org: id,
      p_plan: updates.plan,
    });
    if (billingErr) {
      console.error("[admin/organizations] bootstrap billing (patch):", billingErr.message);
    }
  }

  return NextResponse.json({ organization: data });
}

/** DELETE — eliminar organización */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const db = adminClient();

  const { data: org } = await db.from("organizations").select("owner_user_id, name").eq("id", id).maybeSingle();
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  if (await isProtectedUser(org.owner_user_id)) {
    return NextResponse.json(
      { error: "No se puede eliminar la organización del superadministrador" },
      { status: 403 }
    );
  }

  try {
    await deleteOrganizationCompletely(db, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar organización";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
