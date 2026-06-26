import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { publishPricingChange } from "@/lib/billing/pricing-revision";

/** PATCH — actualizar costos reales de proveedor (USD). */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const updates = Array.isArray(body.updates) ? body.updates : [body];

  if (!updates.length) {
    return NextResponse.json({ error: "Sin actualizaciones" }, { status: 400 });
  }

  const db = adminClient();
  const now = new Date().toISOString();

  for (const row of updates) {
    const rateKey = String(row.rate_key ?? "").trim();
    const costUsd = Number(row.cost_usd);
    if (!rateKey || !Number.isFinite(costUsd) || costUsd < 0) {
      return NextResponse.json({ error: `Costo inválido para ${rateKey || "?"}` }, { status: 400 });
    }

    const { error } = await db
      .from("billing_provider_rates")
      .update({
        cost_usd: costUsd,
        updated_at: now,
        updated_by: auth.userId,
      })
      .eq("rate_key", rateKey);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const revision = await publishPricingChange(db, auth.userId);
  const { refreshPricingConfig } = await import("@/lib/billing/pricing-config");
  const config = await refreshPricingConfig(db);
  return NextResponse.json({ ok: true, revision, provider_rates: config.providerRateMeta });
}
