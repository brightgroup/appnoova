/**
 * Promoción / descuento personalizado en suscripción (configurado desde superadmin).
 */

export interface PlanPromoSnapshot {
  plan_id?: string | null;
  price_usd?: number | null;
  monthly_credits?: number | null;
  custom_label?: string | null;
  plans?: { price_usd?: number | null; monthly_credits?: number | null; name?: string | null } | null;
}

export interface CatalogPlanSnapshot {
  id?: string;
  price_usd?: number | null;
  monthly_credits?: number | null;
  name?: string | null;
}

export interface PlanPromoDisplay {
  has_promo: boolean;
  label: string | null;
  price_usd: number;
  price_usd_catalog: number;
  price_discount_pct: number | null;
  monthly_credits: number;
  monthly_credits_catalog: number;
  credits_bonus_pct: number | null;
  headline: string | null;
}

export function resolvePlanPromo(
  sub: PlanPromoSnapshot | null | undefined,
  catalogPlan: CatalogPlanSnapshot | null | undefined,
  planMonthlyCredits: number
): PlanPromoDisplay | null {
  if (!sub?.plan_id || sub.plan_id === "explorador") return null;

  const catalogPrice = Number(catalogPlan?.price_usd ?? sub.plans?.price_usd ?? 0);
  const effectivePrice = Number(sub.price_usd ?? catalogPrice);
  const catalogCredits = Number(catalogPlan?.monthly_credits ?? sub.plans?.monthly_credits ?? 0);
  const effectiveCredits = planMonthlyCredits;

  const priceDiscountPct =
    catalogPrice > 0 && effectivePrice > 0 && effectivePrice < catalogPrice
      ? Math.round((1 - effectivePrice / catalogPrice) * 100)
      : null;

  const creditsBonusPct =
    catalogCredits > 0 && effectiveCredits > catalogCredits
      ? Math.round(((effectiveCredits - catalogCredits) / catalogCredits) * 100)
      : null;

  const label = sub.custom_label?.trim() || null;
  const hasPromo = Boolean(
    label || (priceDiscountPct != null && priceDiscountPct > 0) || (creditsBonusPct != null && creditsBonusPct > 0)
  );

  if (!hasPromo) return null;

  let headline: string | null = label;
  if (!headline && priceDiscountPct && priceDiscountPct > 0) {
    headline = `${priceDiscountPct}% de descuento en tu plan`;
  } else if (!headline && creditsBonusPct && creditsBonusPct > 0) {
    headline = `+${creditsBonusPct}% créditos extra en tu plan`;
  }

  return {
    has_promo: true,
    label,
    price_usd: effectivePrice,
    price_usd_catalog: catalogPrice,
    price_discount_pct: priceDiscountPct,
    monthly_credits: effectiveCredits,
    monthly_credits_catalog: catalogCredits,
    credits_bonus_pct: creditsBonusPct,
    headline,
  };
}
