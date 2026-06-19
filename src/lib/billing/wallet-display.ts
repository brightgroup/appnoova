/**
 * Créditos efectivos para UI: suscripción + billetera alineados con catálogo de planes.
 */

export interface BillingWalletSnapshot {
  included_credits?: number | null;
  topup_credits?: number | null;
  used_credits?: number | null;
}

export interface BillingSubscriptionSnapshot {
  plan_id?: string | null;
  monthly_credits?: number | null;
  plans?: { monthly_credits?: number | null } | null;
}

export function resolvePlanMonthlyCredits(
  sub: BillingSubscriptionSnapshot | null | undefined,
  catalogPlanId?: string | null,
  catalogMonthlyCredits?: number | null
): number {
  const fromSub = Number(sub?.monthly_credits ?? 0);
  const fromJoin = Number(sub?.plans?.monthly_credits ?? 0);
  const fromCatalog = catalogPlanId && sub?.plan_id === catalogPlanId
    ? Number(catalogMonthlyCredits ?? 0)
    : 0;
  return Math.max(fromSub, fromJoin, fromCatalog, 0);
}

export function resolveBillingBalances(
  wallet: BillingWalletSnapshot | null | undefined,
  planMonthlyCredits: number
) {
  const topup = Number(wallet?.topup_credits ?? 0);
  const includedWallet = Number(wallet?.included_credits ?? 0);
  const included = Math.max(includedWallet, planMonthlyCredits);
  const used = Number(wallet?.used_credits ?? 0);
  const total = included + topup;
  const remaining = Math.max(0, total - used);
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return { included, topup, used, total, remaining, usedPct };
}
