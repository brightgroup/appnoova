import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { verifyPaddleWebhookSignature } from "@/lib/billing/paddle/webhook-verify";

interface PaddleTransactionEvent {
  event_type: string;
  data: {
    id: string;
    subscription_id?: string | null;
    customer_id?: string | null;
    custom_data?: { organization_id?: string } | null;
    currency_code?: string;
    items?: { price?: { id?: string } }[];
    billing_period?: { starts_at?: string; ends_at?: string } | null;
    details?: { totals?: { total?: string } };
  };
}

const priceColumn = process.env.PADDLE_ENV === "live" ? "paddle_price_id_live" : "paddle_price_id_sandbox";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  if (!verifyPaddleWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as PaddleTransactionEvent;
  const db = adminClient();

  try {
    switch (event.event_type) {
      case "transaction.completed": {
        const txn = event.data;
        const organizationId = txn.custom_data?.organization_id;
        const priceId = txn.items?.[0]?.price?.id;
        if (!organizationId || !priceId) {
          console.warn("[paddle:webhook] transaction.completed sin organization_id/price_id", txn.id);
          break;
        }

        const { data: plan } = await db
          .from("plans")
          .select("id")
          .eq(priceColumn, priceId)
          .maybeSingle();

        if (!plan) {
          console.error(`[paddle:webhook] price_id ${priceId} no mapea a ningún plan`);
          break;
        }

        const amountUsd = Number(txn.details?.totals?.total ?? "0") / 100;
        const periodStart = txn.billing_period?.starts_at ?? new Date().toISOString();
        const periodEnd =
          txn.billing_period?.ends_at ??
          new Date(Date.now() + 30 * 86_400_000).toISOString();

        const { error } = await db.rpc("billing_record_paddle_payment", {
          p_org: organizationId,
          p_plan_id: plan.id,
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_amount_usd: amountUsd,
          p_paddle_transaction_id: txn.id,
          p_paddle_subscription_id: txn.subscription_id ?? null,
          p_paddle_customer_id: txn.customer_id ?? null,
        });

        if (error) throw error;
        break;
      }

      case "subscription.canceled": {
        const sub = event.data as unknown as { id: string };
        await db
          .from("organization_subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("paddle_subscription_id", sub.id);
        break;
      }

      default:
        // Otros eventos (subscription.created, subscription.updated, etc.) no
        // requieren acción propia: transaction.completed ya sincroniza todo.
        break;
    }
  } catch (err) {
    console.error("[paddle:webhook] error procesando evento", event.event_type, err);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
