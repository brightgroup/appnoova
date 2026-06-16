import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, isProtectedUser } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { uniqueOrgSlug } from "@/lib/admin-utils";

const PLANS = new Set(["explorador", "esencial", "crecimiento", "escala"]);

/** GET — organizaciones con owner y conteo de miembros */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const { data: orgs, error } = await db
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = orgs ?? [];
  const ownerIds = [...new Set(rows.map((o) => o.owner_user_id))];

  const [ownersRes, membersRes] = await Promise.all([
    ownerIds.length
      ? db.from("profiles").select("id, email, full_name, is_protected").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    db.from("organization_members").select("organization_id, status"),
  ]);

  const ownerMap = new Map((ownersRes.data ?? []).map((p) => [p.id, p]));
  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    if (m.status !== "active") continue;
    memberCounts.set(m.organization_id, (memberCounts.get(m.organization_id) ?? 0) + 1);
  }

  return NextResponse.json({
    organizations: rows.map((o) => ({
      ...o,
      owner: ownerMap.get(o.owner_user_id) ?? null,
      member_count: memberCounts.get(o.id) ?? 0,
      is_protected: ownerMap.get(o.owner_user_id)?.is_protected === true,
    })),
  });
}

/** POST — crear organización para un propietario existente */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const ownerEmail = (body.owner_email as string | undefined)?.trim().toLowerCase();
  const ownerUserId = body.owner_user_id as string | undefined;
  const plan = (body.plan as string | undefined)?.trim() || "explorador";

  if (!name) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  if (!PLANS.has(plan)) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const db = adminClient();
  let ownerId = ownerUserId;

  if (!ownerId && ownerEmail) {
    const { data: profile } = await db.from("profiles").select("id").ilike("email", ownerEmail).maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "No existe usuario con ese email" }, { status: 404 });
    }
    ownerId = profile.id;
  }

  if (!ownerId) {
    return NextResponse.json({ error: "owner_user_id u owner_email requerido" }, { status: 400 });
  }

  const slug = body.slug
    ? await uniqueOrgSlug(db, String(body.slug))
    : await uniqueOrgSlug(db, name);

  const { data: org, error } = await db
    .from("organizations")
    .insert({
      name,
      slug,
      owner_user_id: ownerId,
      status: "active",
      plan,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
      user_id: ownerId,
      role_id: ownerRole.id,
      status: "active",
    });
  }

  await db.from("user_active_organization").upsert({
    user_id: ownerId,
    organization_id: org.id,
  });

  // Crear suscripción + billetera de créditos + primera factura
  const { error: billingErr } = await db.rpc("billing_bootstrap_subscription", {
    p_org: org.id,
    p_plan: plan,
  });
  if (billingErr) {
    console.error("[admin/organizations] bootstrap billing:", billingErr.message);
  }

  return NextResponse.json({ organization: org }, { status: 201 });
}
