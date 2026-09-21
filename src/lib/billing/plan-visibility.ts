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

/**
 * `grantedPlanIds` = ids de `plans` que `plan_organization_grants` habilita para la
 * org que hace la consulta (migración 151) — permite ofrecer un plan privado
 * (is_public=false) a orgs específicas para que lo vean y lo paguen desde su propio
 * panel, sin activarlo de una (eso solo pasa cuando pagan, vía el webhook de Paddle/Bold).
 */
export function planVisibleInBillingCatalog(
  plan: {
    id: string;
    is_active?: boolean | null;
    is_public?: boolean | null;
    is_system?: boolean | null;
    features?: unknown;
  },
  opts: { superAdmin: boolean; currentPlanId?: string | null; grantedPlanIds?: Set<string> }
): boolean {
  if (plan.is_active === false) return false;
  if (plan.is_public === true || plan.is_system === true || plan.id === opts.currentPlanId) {
    return true;
  }
  if (opts.grantedPlanIds?.has(plan.id)) return true;
  return opts.superAdmin && isInternalCheckoutPlan(plan);
}
