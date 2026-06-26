import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CREDIT_COST,
  DEFAULT_CREDIT_USD_VALUE,
  DEFAULT_PROVIDER_RATES,
  DEFAULT_PROVIDER_RATE_META,
  DEFAULT_TRM_COP,
  DEFAULT_UNIT_PRICE_META,
  type ProviderRateMeta,
  type UnitPriceMeta,
} from "@/lib/billing/pricing-defaults";
import type { UsageEventType } from "@/lib/billing/pricing-types";

export interface PricingConfig {
  trmCop: number;
  creditUsdValue: number;
  /** Precio al cliente por unidad (USD) — fuente de verdad. */
  unitPriceUsd: Record<UsageEventType, number>;
  unitPriceMeta: UnitPriceMeta[];
  providerRates: Record<string, number>;
  providerRateMeta: ProviderRateMeta[];
  loadedAt: number;
}

let activeConfig: PricingConfig = buildFromDefaults();
let cacheExpiresAt = 0;
let cachedRevision = 0;
const CACHE_TTL_MS = 5_000;

function defaultUnitPriceUsd(): Record<UsageEventType, number> {
  const map = { ...DEFAULT_CREDIT_COST } as Record<UsageEventType, number>;
  for (const row of DEFAULT_UNIT_PRICE_META) {
    map[row.event_type] = row.price_usd;
  }
  return map;
}

function buildFromDefaults(): PricingConfig {
  return {
    trmCop: DEFAULT_TRM_COP,
    creditUsdValue: DEFAULT_CREDIT_USD_VALUE,
    unitPriceUsd: defaultUnitPriceUsd(),
    unitPriceMeta: DEFAULT_UNIT_PRICE_META.map((r) => ({ ...r })),
    providerRates: { ...DEFAULT_PROVIDER_RATES },
    providerRateMeta: DEFAULT_PROVIDER_RATE_META.map((r) => ({ ...r })),
    loadedAt: Date.now(),
  };
}

export function getPricingConfig(): PricingConfig {
  return activeConfig;
}

export function invalidatePricingCache(): void {
  cacheExpiresAt = 0;
  cachedRevision = 0;
}

export async function refreshPricingConfig(db: SupabaseClient): Promise<PricingConfig> {
  const { getPricingRevision } = await import("@/lib/billing/pricing-revision");
  const revision = await getPricingRevision(db);

  if (Date.now() < cacheExpiresAt && revision === cachedRevision) return activeConfig;

  const [settingsRes, unitsRes, ratesRes] = await Promise.all([
    db.from("billing_settings").select("key, value"),
    db.from("billing_unit_prices").select("*").order("sort_order"),
    db.from("billing_provider_rates").select("*").order("sort_order"),
  ]);

  const next = buildFromDefaults();

  for (const row of settingsRes.data ?? []) {
    if (row.key === "trm_cop") {
      const v = Number(row.value);
      if (Number.isFinite(v) && v > 0) next.trmCop = v;
    }
    if (row.key === "credit_usd_value") {
      const v = Number(row.value);
      if (Number.isFinite(v) && v > 0) next.creditUsdValue = v;
    }
  }

  if (unitsRes.data?.length) {
    next.unitPriceMeta = unitsRes.data.map((row) => {
      const creditsCop = Number(row.credits_cop ?? 0);
      const priceUsdRaw = Number(row.price_usd);
      const priceUsd =
        Number.isFinite(priceUsdRaw) && priceUsdRaw > 0
          ? priceUsdRaw
          : creditsCop / next.trmCop;
      return {
        event_type: row.event_type as UsageEventType,
        label: String(row.label),
        description: row.description ? String(row.description) : null,
        unit_label: String(row.unit_label ?? "por unidad"),
        category: String(row.category ?? "general"),
        price_usd: priceUsd,
        credits_cop: creditsCop,
        sort_order: Number(row.sort_order ?? 0),
        is_active: row.is_active !== false,
      };
    });
    for (const row of next.unitPriceMeta) {
      if (row.is_active) {
        next.unitPriceUsd[row.event_type] = row.price_usd;
      }
    }
  }

  if (ratesRes.data?.length) {
    next.providerRateMeta = ratesRes.data.map((row) => ({
      rate_key: String(row.rate_key),
      provider: String(row.provider),
      label: String(row.label),
      description: row.description ? String(row.description) : null,
      unit_label: String(row.unit_label ?? "por unidad"),
      cost_usd: Number(row.cost_usd ?? 0),
      sort_order: Number(row.sort_order ?? 0),
    }));
    for (const row of next.providerRateMeta) {
      next.providerRates[row.rate_key] = row.cost_usd;
    }
  }

  next.loadedAt = Date.now();
  activeConfig = next;
  cachedRevision = revision;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return next;
}

export async function ensurePricingConfig(db: SupabaseClient): Promise<PricingConfig> {
  const { getPricingRevision } = await import("@/lib/billing/pricing-revision");
  const revision = await getPricingRevision(db);
  if (revision !== cachedRevision || Date.now() >= cacheExpiresAt) {
    return refreshPricingConfig(db);
  }
  return activeConfig;
}
