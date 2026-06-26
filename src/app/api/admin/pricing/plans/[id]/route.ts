import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  creditsPerUsdFromTiers,
  monthlyCreditsFromPriceUsd,
} from "@/lib/billing/plan-credits";
import { publishPricingChange } from "@/lib/billing/pricing-revision";

/** PATCH — editar paquete (precio, créditos, características). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const { data: plan, error: fetchErr } = await db
    .from("plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });

  const isSystem = Boolean(plan.is_system);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name != null) patch.name = String(body.name).trim();
  if (body.trial_days != null) patch.trial_days = Number(body.trial_days);
  if (body.whatsapp_included != null) patch.whatsapp_included = Boolean(body.whatsapp_included);
  if (body.max_text_agents !== undefined) {
    patch.max_text_agents =
      body.max_text_agents === null || body.max_text_agents === ""
        ? null
        : Number(body.max_text_agents);
  }
  if (body.max_users !== undefined) {
    patch.max_users =
      body.max_users === null || body.max_users === "" ? null : Number(body.max_users);
  }
  if (body.support_level != null) patch.support_level = String(body.support_level);
  if (body.sort_order != null) patch.sort_order = Number(body.sort_order);
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);
  if (body.features != null) patch.features = body.features;

  if (body.price_usd != null) {
    const priceUsd = Number(body.price_usd);
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      return NextResponse.json({ error: "Precio USD inválido" }, { status: 400 });
    }
    patch.price_usd = priceUsd;
  }

  if (body.monthly_credits != null) {
    const credits = Math.round(Number(body.monthly_credits));
    if (!Number.isFinite(credits) || credits < 0) {
      return NextResponse.json({ error: "Créditos mensuales inválidos" }, { status: 400 });
    }
    patch.monthly_credits = credits;
  } else if (!isSystem && body.price_usd != null && Number(body.price_usd) > 0) {
    const { data: systemPlans } = await db
      .from("plans")
      .select("price_usd, monthly_credits")
      .eq("is_system", true);
    const ratio = creditsPerUsdFromTiers(systemPlans ?? []);
    patch.monthly_credits = monthlyCreditsFromPriceUsd(Number(body.price_usd), ratio);
  }

  const { data, error } = await db.from("plans").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const revision = await publishPricingChange(db, auth.userId);
  return NextResponse.json({ plan: data, revision });
}
