import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createPaddlePortalSession } from "@/lib/billing/paddle/client";

/** POST — link de un solo uso al portal de cliente de Paddle (actualizar tarjeta, ver facturas). */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("paddle_customer_id, paddle_subscription_id, billing_provider")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.paddle_customer_id || sub.billing_provider !== "paddle") {
    return NextResponse.json(
      { error: "Esta cuenta todavía no tiene un método de pago con tarjeta registrado" },
      { status: 422 }
    );
  }

  try {
    const session = await createPaddlePortalSession(
      sub.paddle_customer_id,
      sub.paddle_subscription_id ? [sub.paddle_subscription_id] : []
    );
    return NextResponse.json({ url: session.urls.general.overview });
  } catch (err) {
    console.error("[paddle:portal]", err);
    return NextResponse.json({ error: "No se pudo abrir el portal de pagos" }, { status: 422 });
  }
}
