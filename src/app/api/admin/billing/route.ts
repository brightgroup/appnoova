import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { refreshPricingConfig } from "@/lib/billing/pricing-config";
import { getTrmCop } from "@/lib/billing/pricing";

interface OverviewRow {
  organization_id: string;
  cost_cop: number;
  credits_charged: number;
  twilio_cost_cop: number;
  google_cost_cop: number;
  telnyx_cost_cop: number;
}

/** GET — overview de facturación por cliente (consumo, costo real, margen) */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  await refreshPricingConfig(db);

  const [orgsRes, subsRes, walletsRes, overviewRes, plansRes] = await Promise.all([
    db.from("organizations").select("id, name, slug, status, owner_user_id").order("created_at", { ascending: false }),
    db.from("organization_subscriptions").select("*"),
    db.from("organization_credit_wallets").select("*"),
    db.rpc("billing_admin_overview"),
    db.from("plans").select("*").order("sort_order")
  ]);

  const orgs = orgsRes.data ?? [];
  const ownerIds = [...new Set(orgs.map((o) => o.owner_user_id).filter(Boolean))];
  const ownersRes = ownerIds.length
    ? await db.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };

  const ownerMap = new Map((ownersRes.data ?? []).map((p) => [p.id, p]));
  const subMap = new Map((subsRes.data ?? []).map((s) => [s.organization_id, s]));
  const walletMap = new Map((walletsRes.data ?? []).map((w) => [w.organization_id, w]));
  const planMap = new Map((plansRes.data ?? []).map((p) => [p.id, p]));
  const overviewMap = new Map(
    ((overviewRes.data ?? []) as OverviewRow[]).map((r) => [r.organization_id, r])
  );

  let totalRevenue = 0;
  let totalCost = 0;
  let totalTwilio = 0;
  let totalGoogle = 0;
  let totalTelnyx = 0;
  let mrrUsd = 0;

  const rows = orgs.map((o) => {
    const sub = subMap.get(o.id);
    const wallet = walletMap.get(o.id);
    const ov = overviewMap.get(o.id);
    const owner = ownerMap.get(o.owner_user_id);

    const plan = sub?.plan_id ? planMap.get(sub.plan_id) : undefined;
    const priceUsd = sub?.custom_label
      ? Number(sub?.price_usd ?? plan?.price_usd ?? 0)
      : Number(plan?.price_usd ?? sub?.price_usd ?? 0);
    const revenueCop = Math.round(priceUsd * getTrmCop());
    const costCop = Number(ov?.cost_cop ?? 0);
    const included = Number(wallet?.included_credits ?? 0) + Number(wallet?.topup_credits ?? 0);
    const used = Number(wallet?.used_credits ?? 0);
    const marginCop = revenueCop - costCop;
    const marginPct = revenueCop > 0 ? Math.round((marginCop / revenueCop) * 100) : null;

    // Solo cuentan al MRR/margen global las suscripciones de pago activas
    const counts = sub && ["active", "past_due"].includes(String(sub.status)) && priceUsd > 0;
    if (counts) {
      totalRevenue += revenueCop;
      mrrUsd += priceUsd;
    }
    totalCost += costCop;
    totalTwilio += Number(ov?.twilio_cost_cop ?? 0);
    totalGoogle += Number(ov?.google_cost_cop ?? 0);
    totalTelnyx += Number(ov?.telnyx_cost_cop ?? 0);

    return {
      organization_id: o.id,
      name: o.name,
      slug: o.slug,
      org_status: o.status,
      owner_email: owner?.email ?? null,
      plan_id: sub?.plan_id ?? null,
      status: sub?.status ?? null,
      period_start: sub?.current_period_start ?? null,
      period_end: sub?.current_period_end ?? null,
      trial_ends_at: sub?.trial_ends_at ?? null,
      price_usd: priceUsd,
      revenue_cop: revenueCop,
      included_credits: included,
      used_credits: used,
      remaining_credits: included - used,
      used_pct: included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0,
      credits_charged: Number(ov?.credits_charged ?? 0),
      cost_cop: costCop,
      twilio_cost_cop: Number(ov?.twilio_cost_cop ?? 0),
      google_cost_cop: Number(ov?.google_cost_cop ?? 0),
      telnyx_cost_cop: Number(ov?.telnyx_cost_cop ?? 0),
      margin_cop: marginCop,
      margin_pct: marginPct
    };
  });

  const totalMargin = totalRevenue - totalCost;

  return NextResponse.json({
    plans: plansRes.data ?? [],
    totals: {
      mrr_usd: mrrUsd,
      revenue_cop: totalRevenue,
      cost_cop: totalCost,
      margin_cop: totalMargin,
      margin_pct: totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : null,
      twilio_cost_cop: totalTwilio,
      google_cost_cop: totalGoogle,
      telnyx_cost_cop: totalTelnyx
    },
    rows
  });
}
