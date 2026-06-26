import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { publishPricingChange } from "@/lib/billing/pricing-revision";
import { refreshPricingConfig } from "@/lib/billing/pricing-config";
import { usdPriceFromCredits } from "@/lib/billing/credit-usd";

/** PATCH — actualizar créditos por solución (price_usd se deriva del valor del crédito). */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const updates = Array.isArray(body.updates) ? body.updates : [body];

  if (!updates.length) {
    return NextResponse.json({ error: "Sin actualizaciones" }, { status: 400 });
  }

  const db = adminClient();
  const config = await refreshPricingConfig(db);
  const now = new Date().toISOString();

  for (const row of updates) {
    const eventType = String(row.event_type ?? "").trim();
    const credits = Math.round(Number(row.credits));
    if (!eventType || !Number.isFinite(credits) || credits < 1) {
      return NextResponse.json({ error: `Créditos inválidos para ${eventType || "?"}` }, { status: 400 });
    }

    const priceUsd = usdPriceFromCredits(credits, config.creditUsdValue);
    const creditsCopRef = Math.round(priceUsd * config.trmCop * 100) / 100;

    const patch: Record<string, unknown> = {
      price_usd: priceUsd,
      credits_cop: creditsCopRef,
      updated_at: now,
      updated_by: auth.userId,
    };
    if (row.is_active != null) patch.is_active = Boolean(row.is_active);

    const { error } = await db
      .from("billing_unit_prices")
      .update(patch)
      .eq("event_type", eventType);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const revision = await publishPricingChange(db, auth.userId);
  const refreshed = await refreshPricingConfig(db);
  return NextResponse.json({ ok: true, revision, unit_prices: refreshed.unitPriceMeta });
}
