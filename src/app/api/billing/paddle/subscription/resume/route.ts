import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { undoPaddleScheduledCancel } from "@/lib/billing/paddle/client";

/** POST — deshace una cancelación programada (antes de que llegue la fecha efectiva). */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("billing_provider, paddle_subscription_id, paddle_cancel_scheduled_at")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.paddle_subscription_id || sub.billing_provider !== "paddle") {
    return NextResponse.json({ error: "Esta cuenta no tiene una suscripción de Paddle" }, { status: 422 });
  }
  if (!sub.paddle_cancel_scheduled_at) {
    return NextResponse.json({ error: "No hay ninguna cancelación programada" }, { status: 422 });
  }

  try {
    await undoPaddleScheduledCancel(sub.paddle_subscription_id);
    await db
      .from("organization_subscriptions")
      .update({ paddle_cancel_scheduled_at: null, updated_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[paddle:resume]", err);
    return NextResponse.json({ error: "No se pudo deshacer la cancelación" }, { status: 422 });
  }
}
