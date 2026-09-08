import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { listPaddlePaymentMethods } from "@/lib/billing/paddle/client";

/** GET — tarjeta guardada del cliente (marca + últimos 4 dígitos), si paga con Paddle. */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("paddle_customer_id, billing_provider")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!sub?.paddle_customer_id || sub.billing_provider !== "paddle") {
    return NextResponse.json({ payment_method: null });
  }

  try {
    const methods = await listPaddlePaymentMethods(sub.paddle_customer_id);
    const card = methods.find((m) => m.type === "card" && m.card);
    return NextResponse.json({
      payment_method: card?.card
        ? { brand: card.card.type ?? null, last4: card.card.last4 ?? null }
        : null,
    });
  } catch (err) {
    console.error("[paddle:payment-method]", err);
    return NextResponse.json({ payment_method: null });
  }
}
