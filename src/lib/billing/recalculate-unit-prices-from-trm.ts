import type { SupabaseClient } from "@supabase/supabase-js";
import { publishPricingChange } from "@/lib/billing/pricing-revision";

/** Recalcula price_usd desde credits_cop (precio comercial en COP) con la TRM vigente. */
export async function recalculateUnitPricesFromCopReference(
  db: SupabaseClient,
  trmCop: number,
  updatedBy?: string | null
): Promise<number> {
  if (!Number.isFinite(trmCop) || trmCop <= 0) return 0;

  const { data: rows, error } = await db
    .from("billing_unit_prices")
    .select("event_type, credits_cop")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  let updated = 0;

  for (const row of rows ?? []) {
    const creditsCop = Number(row.credits_cop);
    if (!Number.isFinite(creditsCop) || creditsCop <= 0) continue;

    const priceUsd = Math.round((creditsCop / trmCop) * 1e8) / 1e8;
    const { error: upErr } = await db
      .from("billing_unit_prices")
      .update({
        price_usd: priceUsd,
        updated_at: now,
        updated_by: updatedBy ?? null,
      })
      .eq("event_type", row.event_type);

    if (!upErr) updated += 1;
  }

  if (updated > 0) {
    await publishPricingChange(db, updatedBy);
  }

  return updated;
}
