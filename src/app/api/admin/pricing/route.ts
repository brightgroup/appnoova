import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { refreshPricingConfig } from "@/lib/billing/pricing-config";
import { publishPricingChange } from "@/lib/billing/pricing-revision";
import { creditsPerUsdFromTiers } from "@/lib/billing/plan-credits";
import { syncOfficialTrm } from "@/lib/billing/trm-colombia";
import { usdPriceFromCredits } from "@/lib/billing/credit-usd";

/** GET — configuración completa de pricing (paquetes, precios cliente, costos proveedor). */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const trmSync = await syncOfficialTrm(db, { userId: auth.userId });
  const config = await refreshPricingConfig(db);

  const { data: plans, error: plansErr } = await db
    .from("plans")
    .select("*")
    .order("sort_order");

  if (plansErr) {
    return NextResponse.json({ error: plansErr.message }, { status: 500 });
  }

  const systemTiers = (plans ?? [])
    .filter((p) => p.is_system && Number(p.price_usd) > 0)
    .map((p) => ({ price_usd: Number(p.price_usd), monthly_credits: Number(p.monthly_credits) }));

  return NextResponse.json({
    trm_cop: config.trmCop,
    credit_usd_value: config.creditUsdValue,
    trm_effective_date: trmSync.effectiveFrom,
    trm_official_source: trmSync.source,
    trm_updated: trmSync.updated,
    trm_sync_error: trmSync.error ?? null,
    credits_per_usd: creditsPerUsdFromTiers(systemTiers),
    unit_prices: config.unitPriceMeta,
    provider_rates: config.providerRateMeta,
    plans: plans ?? [],
  });
}

/** PATCH — actualizar TRM u otros ajustes globales. */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  if (body.credit_usd_value != null) {
    const v = Number(body.credit_usd_value);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: "Valor de crédito inválido" }, { status: 400 });
    }

    const config = await refreshPricingConfig(db);
    const oldCreditUsd = config.creditUsdValue;

    const { data: units, error: unitsErr } = await db
      .from("billing_unit_prices")
      .select("event_type, price_usd");

    if (unitsErr) return NextResponse.json({ error: unitsErr.message }, { status: 500 });

    const now = new Date().toISOString();
    for (const row of units ?? []) {
      const credits = Math.max(1, Math.round(Number(row.price_usd) / oldCreditUsd));
      const priceUsd = usdPriceFromCredits(credits, v);
      const creditsCopRef = Math.round(priceUsd * config.trmCop * 100) / 100;
      const { error } = await db
        .from("billing_unit_prices")
        .update({
          price_usd: priceUsd,
          credits_cop: creditsCopRef,
          updated_at: now,
          updated_by: auth.userId,
        })
        .eq("event_type", row.event_type);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (v !== oldCreditUsd) {
      const { error } = await db.from("billing_settings").upsert({
        key: "credit_usd_value",
        value: v,
        updated_at: now,
        updated_by: auth.userId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body.trm_cop != null) {
    const trm = Number(body.trm_cop);
    if (!Number.isFinite(trm) || trm <= 0) {
      return NextResponse.json({ error: "TRM inválida" }, { status: 400 });
    }
    const { error } = await db.from("billing_settings").upsert({
      key: "trm_cop",
      value: trm,
      updated_at: new Date().toISOString(),
      updated_by: auth.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const revision = await publishPricingChange(db, auth.userId);
  return NextResponse.json({ ok: true, revision });
}
