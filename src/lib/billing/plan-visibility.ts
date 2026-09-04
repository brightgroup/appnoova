/** Planes is_public=false que solo el superadmin ve en Facturación (p. ej. QA $1). */
export function isInternalCheckoutPlan(plan: {
  id?: string;
  is_public?: boolean | null;
  is_system?: boolean | null;
  features?: unknown;
}): boolean {
  if (plan.id === "paddle_qa") return true;
  const features = plan.features as { internal_test?: boolean } | null;
  return features?.internal_test === true;
}

export function planVisibleInBillingCatalog(
  plan: {
    id: string;
    is_active?: boolean | null;
    is_public?: boolean | null;
    is_system?: boolean | null;
    features?: unknown;
  },
  opts: { superAdmin: boolean; currentPlanId?: string | null }
): boolean {
  if (plan.is_active === false) return false;
  if (plan.is_public === true || plan.is_system === true || plan.id === opts.currentPlanId) {
    return true;
  }
  return opts.superAdmin && isInternalCheckoutPlan(plan);
}
