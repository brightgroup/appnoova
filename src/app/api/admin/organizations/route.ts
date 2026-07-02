import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  bootstrapOrganization,
  createAuthUser,
  resolveUserIdByEmail,
} from "@/lib/admin-provisioning";
import { isActivePlanId } from "@/lib/org-plans";

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
  const ownerIds = [...new Set(rows.map(o => o.owner_user_id))];
  const orgIds = rows.map(o => o.id);

  const [ownersRes, membersRes, subsRes, plansRes] = await Promise.all([
    ownerIds.length
      ? db.from("profiles").select("id, email, full_name, is_protected").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    db.from("organization_members").select("organization_id, status"),
    orgIds.length
      ? db.from("organization_subscriptions").select("organization_id, plan_id").in("organization_id", orgIds)
      : Promise.resolve({ data: [] }),
    db.from("plans").select("id, name"),
  ]);

  const ownerMap = new Map((ownersRes.data ?? []).map(p => [p.id, p]));
  const subPlanMap = new Map((subsRes.data ?? []).map(s => [s.organization_id, s.plan_id]));
  const planNameMap = new Map((plansRes.data ?? []).map(p => [p.id, p.name]));
  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    if (m.status !== "active") continue;
    memberCounts.set(m.organization_id, (memberCounts.get(m.organization_id) ?? 0) + 1);
  }

  return NextResponse.json({
    organizations: rows.map(o => {
      const effectivePlan = subPlanMap.get(o.id) ?? o.plan;
      return {
        ...o,
        plan: effectivePlan,
        plan_name: planNameMap.get(effectivePlan) ?? effectivePlan,
        owner: ownerMap.get(o.owner_user_id) ?? null,
        member_count: memberCounts.get(o.id) ?? 0,
        is_protected: ownerMap.get(o.owner_user_id)?.is_protected === true,
      };
    }),
  });
}

/** POST — crear organización (propietario nuevo o existente) */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const plan = (body.plan as string | undefined)?.trim() || "explorador";
  const ownerMode = body.owner_mode === "existing" ? "existing" : "new";

  if (!name) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const db = adminClient();
  if (!(await isActivePlanId(db, plan))) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }
  let ownerId = body.owner_user_id as string | undefined;
  let temporaryPassword: string | undefined;
  let ownerEmail = (body.owner_email as string | undefined)?.trim().toLowerCase() ?? "";

  try {
    if (ownerMode === "existing") {
      if (!ownerId && ownerEmail) {
        ownerId = (await resolveUserIdByEmail(db, ownerEmail)) ?? undefined;
      }
      if (!ownerId) {
        return NextResponse.json(
          { error: "No existe un usuario con ese email. Créalo primero o usa «Propietario nuevo»." },
          { status: 404 }
        );
      }
    } else {
      ownerEmail = (body.owner_email as string | undefined)?.trim().toLowerCase() ?? "";
      const ownerName = (body.owner_full_name as string | undefined)?.trim() ?? "";
      const ownerPassword = (body.owner_password as string | undefined)?.trim();

      if (!ownerEmail) {
        return NextResponse.json({ error: "Email del propietario requerido" }, { status: 400 });
      }

      const existingId = await resolveUserIdByEmail(db, ownerEmail);
      if (existingId) {
        ownerId = existingId;
      } else {
        const created = await createAuthUser(db, {
          email: ownerEmail,
          fullName: ownerName,
          password: ownerPassword,
        });
        ownerId = created.userId;
        temporaryPassword = created.temporaryPassword;
      }
    }

    if (!ownerId) {
      return NextResponse.json({ error: "Propietario requerido" }, { status: 400 });
    }

    const org = await bootstrapOrganization(db, {
      name,
      slug: body.slug ? String(body.slug) : undefined,
      ownerUserId: ownerId,
      plan,
      hideNoovaLogo: body.hide_noova_logo === true,
    });

    return NextResponse.json(
      {
        organization: { id: org.id, slug: org.slug, name, plan, owner_user_id: ownerId },
        owner_email: ownerEmail || undefined,
        temporary_password: temporaryPassword,
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al crear organización" },
      { status: 400 }
    );
  }
}
