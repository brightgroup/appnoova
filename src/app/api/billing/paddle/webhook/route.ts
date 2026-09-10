import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { applyPaddleTransactionCompleted } from "@/lib/billing/paddle/apply-completed-transaction";
import { verifyPaddleWebhookSignature } from "@/lib/billing/paddle/webhook-verify";
import type { PaddleTransaction } from "@/lib/billing/paddle/client";

interface PaddleEvent {
  event_type: string;
  data: PaddleTransaction & {
    status?: string;
    scheduled_change?: { action?: string; effective_at?: string } | null;
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  if (!verifyPaddleWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as PaddleEvent;
  const db = adminClient();

  try {
    switch (event.event_type) {
      case "transaction.completed": {
        const result = await applyPaddleTransactionCompleted(db, event.data, event.event_type);
        if (!result.ok) {
          // 200: Paddle no reintenta un evento que ya no va a traer custom_data.
          // El unmatched queda en paddle_unmatched_events para conciliar.
          break;
        }
        break;
      }

      case "subscription.canceled": {
        const sub = event.data as unknown as { id: string };
        await db
          .from("organization_subscriptions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            paddle_cancel_scheduled_at: null,
          })
          .eq("paddle_subscription_id", sub.id);
        break;
      }

      case "subscription.past_due": {
        const { error } = await db.rpc("billing_mark_paddle_past_due", {
          p_paddle_subscription_id: event.data.id,
        });
        if (error) throw error;
        break;
      }

      case "subscription.updated": {
        if (event.data.status === "active" || event.data.status === "trialing") {
          const { error } = await db.rpc("billing_clear_paddle_past_due", {
            p_paddle_subscription_id: event.data.id,
          });
          if (error) throw error;
        }

        const scheduledCancel =
          event.data.scheduled_change?.action === "cancel"
            ? event.data.scheduled_change.effective_at ?? null
            : null;
        await db
          .from("organization_subscriptions")
          .update({ paddle_cancel_scheduled_at: scheduledCancel })
          .eq("paddle_subscription_id", event.data.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[paddle:webhook] error procesando evento", event.event_type, err);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
