import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { verifyPaddleWebhookSignature } from "@/lib/billing/paddle/webhook-verify";

interface PaddleTransactionEvent {
  event_type: string;
  data: {
    id: string;
    status?: string;
    subscription_id?: string | null;
    customer_id?: string | null;
    custom_data?: { organization_id?: string; plan_id?: string; kind?: string; package_id?: string } | null;
    currency_code?: string;
    items?: { price?: { id?: string } }[];
    billing_period?: { starts_at?: string; ends_at?: string } | null;
    details?: { totals?: { total?: string } };
    scheduled_change?: { action?: string; effective_at?: string } | null;
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

        // Compra manual de créditos (no confundir con un pago de plan: no debe
        // tocar el periodo de la suscripción ni resetear créditos incluidos).
        if (txn.custom_data?.kind === "topup") {
          const packageId = txn.custom_data.package_id;
          const { data: pkg } = await db
            .from("credit_packages")
            .select("credits")
            .eq("id", packageId ?? "")
            .maybeSingle();
          if (!pkg) {
            console.error(`[paddle:webhook] topup sin paquete válido (package_id=${packageId})`, txn.id);
            break;
          }
          const { error } = await db.rpc("billing_admin_add_credits", {
            p_org: organizationId,
            p_credits: pkg.credits,
            p_reason: `Compra de créditos (Paddle transaction ${txn.id})`,
          });
          if (error) throw error;
          break;
        }

        // plan_id explícito en custom_data (ver createPaddleCheckoutTransaction) es
        // la fuente de verdad: dos planes internos pueden compartir el mismo
        // price_id de Paddle, así que resolver por precio es ambiguo. El fallback
        // por precio solo cubre transacciones creadas antes de este cambio.
        let planId = txn.custom_data?.plan_id ?? null;
        if (!planId) {
          const { data: plansByPrice } = await db
            .from("plans")
            .select("id")
            .eq(priceColumn, priceId)
            .limit(1);
          planId = plansByPrice?.[0]?.id ?? null;
        }

        if (!planId) {
          console.error(`[paddle:webhook] price_id ${priceId} no mapea a ningún plan`);
          break;
        }

        // El total de la transacción viene en la moneda del precio (puede no ser
        // USD, ej. el plan a la medida de Newbody está en COP) — solo se usa como
        // "amount_usd" cuando de verdad es USD. Para cualquier otra moneda se usa
        // el price_usd de referencia del plan en vez de convertir mal la cifra.
        const rawTotal = Number(txn.details?.totals?.total ?? "0") / 100;
        let amountUsd = rawTotal;
        if (txn.currency_code && txn.currency_code !== "USD") {
          const { data: planRow } = await db.from("plans").select("price_usd").eq("id", planId).maybeSingle();
          amountUsd = Number(planRow?.price_usd ?? rawTotal);
        }
        const periodStart = txn.billing_period?.starts_at ?? new Date().toISOString();
        const periodEnd =
          txn.billing_period?.ends_at ??
          new Date(Date.now() + 30 * 86_400_000).toISOString();

        const { error } = await db.rpc("billing_record_paddle_payment", {
          p_org: organizationId,
          p_plan_id: planId,
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
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            paddle_cancel_scheduled_at: null,
          })
          .eq("paddle_subscription_id", sub.id);
        break;
      }

      case "subscription.past_due": {
        // El cobro automático falló. Arranca el reloj de gracia local
        // (billing_run_renewals suspende pasados grace_days sin recuperarse);
        // no esperamos a que Paddle agote sus propios reintentos de dunning.
        const { error } = await db.rpc("billing_mark_paddle_past_due", {
          p_paddle_subscription_id: event.data.id,
        });
        if (error) throw error;
        break;
      }

      case "subscription.updated": {
        // Si Paddle recuperó el cobro (vuelve a active/trialing), limpiar la
        // marca de mora local. transaction.completed ya reactiva la org si
        // estaba suspendida; esto cubre el caso "past_due -> active" sin una
        // transacción nueva de por medio.
        if (event.data.status === "active" || event.data.status === "trialing") {
          const { error } = await db.rpc("billing_clear_paddle_past_due", {
            p_paddle_subscription_id: event.data.id,
          });
          if (error) throw error;
        }

        // Sincroniza la cancelación programada aunque el cliente la haya
        // pedido desde el portal de Paddle en vez de nuestro botón (o la
        // haya deshecho ahí) — nuestras rutas de cancelar/resumir ya la
        // fijan de forma optimista, esto cubre cualquier otro origen.
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
        // Otros eventos (subscription.created, etc.) no requieren acción
        // propia: transaction.completed ya sincroniza todo.
        break;
    }
  } catch (err) {
    console.error("[paddle:webhook] error procesando evento", event.event_type, err);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
