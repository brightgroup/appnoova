import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidatePricingCache, refreshPricingConfig } from "@/lib/billing/pricing-config";

const REVISION_KEY = "pricing_revision";

/** Lee la revisión global de pricing (timestamp en billing_settings). */
export async function getPricingRevision(db: SupabaseClient): Promise<number> {
  const { data } = await db
    .from("billing_settings")
    .select("value")
    .eq("key", REVISION_KEY)
    .maybeSingle();
  const v = Number(data?.value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** Incrementa revisión tras un cambio en admin — invalida caché de servidor y recarga config. */
export async function publishPricingChange(
  db: SupabaseClient,
  userId?: string | null
): Promise<number> {
  const revision = Date.now();
  await db.from("billing_settings").upsert({
    key: REVISION_KEY,
    value: revision,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  });
  invalidatePricingCache();
  await refreshPricingConfig(db);
  return revision;
}
