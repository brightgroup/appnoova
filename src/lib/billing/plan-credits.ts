/**
 * Calcula créditos mensuales a partir del precio USD del paquete,
 * usando la misma relación precio→créditos de los planes de sistema.
 */

const FALLBACK_CREDITS_PER_USD = 350_000 / 82; // Esencial — referencia del catálogo

export interface PlanCreditTier {
  price_usd: number;
  monthly_credits: number;
}

/** Promedio de créditos/USD de los planes de pago del sistema. */
export function creditsPerUsdFromTiers(tiers: PlanCreditTier[]): number {
  const paid = tiers.filter((t) => Number(t.price_usd) > 0 && Number(t.monthly_credits) > 0);
  if (!paid.length) return FALLBACK_CREDITS_PER_USD;
  const sum = paid.reduce((acc, t) => acc + Number(t.monthly_credits) / Number(t.price_usd), 0);
  return sum / paid.length;
}

export function monthlyCreditsFromPriceUsd(priceUsd: number, creditsPerUsd?: number): number {
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const ratio = creditsPerUsd && creditsPerUsd > 0 ? creditsPerUsd : FALLBACK_CREDITS_PER_USD;
  return Math.round(price * ratio);
}

export interface PlanVolumeMetrics {
  nominal_usd: number;
  credits_per_usd: number | null;
  volume_discount_pct: number | null;
}

/** Valor nominal del paquete y descuento por volumen vs precio de lista (cr × credit_usd). */
export function planVolumeMetrics(
  priceUsd: number,
  monthlyCredits: number,
  creditUsdValue: number
): PlanVolumeMetrics {
  const price = Number(priceUsd);
  const credits = Number(monthlyCredits);
  const creditUsd = Number(creditUsdValue);
  const nominal = credits * creditUsd;
  if (price <= 0) {
    return { nominal_usd: nominal, credits_per_usd: null, volume_discount_pct: null };
  }
  const creditsPerUsd = credits / price;
  const volumeDiscountPct =
    nominal > 0 ? Math.round((1 - price / nominal) * 1000) / 10 : null;
  return {
    nominal_usd: nominal,
    credits_per_usd: creditsPerUsd,
    volume_discount_pct: volumeDiscountPct,
  };
}
