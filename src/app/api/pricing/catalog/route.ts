import { NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { refreshPricingConfig } from "@/lib/billing/pricing-config";
import { creditsFromUsdPrice } from "@/lib/billing/credit-usd";
import { getPricingRevision } from "@/lib/billing/pricing-revision";

/** GET — catálogo público de precios al cliente (para UI y cotizadores). */
export async function GET() {
  const db = adminClient();
  const [config, revision] = await Promise.all([
    refreshPricingConfig(db),
    getPricingRevision(db),
  ]);

  const { data: plans } = await db
    .from("plans")
    .select("id, name, price_usd, monthly_credits, trial_days, sort_order")
    .eq("is_public", true)
    .eq("is_active", true)
    .order("sort_order");

  return NextResponse.json(
    {
      revision,
      credit_usd_value: config.creditUsdValue,
    trm_cop: config.trmCop,
    unit_prices: config.unitPriceMeta.map((u) => ({
      event_type: u.event_type,
      label: u.label,
      unit_label: u.unit_label,
      category: u.category,
      price_usd: u.price_usd,
      credits: creditsFromUsdPrice(u.price_usd),
      cop_reference: Math.round(u.price_usd * config.trmCop * 100) / 100,
    })),
    voice_standard_per_min: creditsFromUsdPrice(config.unitPriceUsd.voice ?? 0),
    voice_premium_per_min: creditsFromUsdPrice(config.unitPriceUsd.voice_premium ?? 0),
    plans: (plans ?? []).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      price_usd: Number(p.price_usd ?? 0),
      monthly_credits: Number(p.monthly_credits ?? 0),
      trial_days: Number(p.trial_days ?? 0),
      sort_order: Number(p.sort_order ?? 0),
    })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
