import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { cancelPaddleSubscription } from "@/lib/billing/paddle/client";

/**
 * POST — cancela la suscripción de Paddle de la org al final del ciclo ya
 * pagado (nunca de inmediato). El acceso se mantiene hasta esa fecha; el
 * webhook subscription.canceled es quien marca el estado final.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("billing_provider, paddle_subscription_id, status")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.paddle_subscription_id || sub.billing_provider !== "paddle") {
    return NextResponse.json(
      { error: "Esta cuenta no tiene una suscripción de Paddle activa para cancelar" },
      { status: 422 }
    );
  }
  if (sub.status === "canceled") {
    return NextResponse.json({ error: "La suscripción ya está cancelada" }, { status: 422 });
  }

  try {
    const result = await cancelPaddleSubscription(sub.paddle_subscription_id, "next_billing_period");
    const effectiveAt = result.scheduled_change?.effective_at ?? null;

    await db
      .from("organization_subscriptions")
      .update({ paddle_cancel_scheduled_at: effectiveAt, updated_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId);

    return NextResponse.json({ ok: true, effective_at: effectiveAt });
  } catch (err) {
    console.error("[paddle:cancel]", err);
    return NextResponse.json({ error: "No se pudo cancelar la suscripción" }, { status: 422 });
  }
}
