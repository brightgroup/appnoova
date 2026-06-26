import { getPricingConfig } from "@/lib/billing/pricing-config";

export const DEFAULT_CREDIT_USD_VALUE = 0.0003;

/** Valor de 1 crédito en USD (fuente de verdad del sistema). */
export function getCreditUsdValue(): number {
  return getPricingConfig().creditUsdValue ?? DEFAULT_CREDIT_USD_VALUE;
}

/** Créditos a cobrar por un precio en USD. */
export function creditsFromUsdPrice(priceUsd: number, quantity = 1): number {
  const unitUsd = Number(priceUsd) * quantity;
  if (!Number.isFinite(unitUsd) || unitUsd <= 0) return 0;
  const creditUsd = getCreditUsdValue();
  if (creditUsd <= 0) return 0;
  return Math.max(1, Math.round(unitUsd / creditUsd));
}

/** Precio USD a partir de créditos asignados. */
export function usdPriceFromCredits(credits: number, creditUsdValue?: number): number {
  const c = Math.max(0, Math.round(Number(credits)));
  if (c <= 0) return 0;
  const rate = creditUsdValue ?? getCreditUsdValue();
  if (rate <= 0) return 0;
  return c * rate;
}

/** Equivalente COP de un monto USD (solo referencia / admin). */
export function usdToCopReference(usd: number): number {
  const trm = getPricingConfig().trmCop;
  if (!trm || trm <= 0) return 0;
  return Math.round(usd * trm * 100) / 100;
}

/** Equivalente COP del valor de N créditos. */
export function creditsToCopReference(credits: number): number {
  return usdToCopReference(credits * getCreditUsdValue());
}
