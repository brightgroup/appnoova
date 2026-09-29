import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/voice-agents-server";
import { getBoldPaymentLinkStatus } from "@/lib/billing/bold/client";
import { applyBoldSaleApproved, type BoldWebhookData } from "@/lib/billing/bold/apply-completed-payment";
import { verifyBoldWebhookSignature } from "@/lib/billing/bold/webhook-verify";

interface BoldEvent {
  id: string;
  type: "SALE_APPROVED" | "SALE_REJECTED" | "VOID_APPROVED" | "VOID_REJECTED";
  subject: string;
  data: BoldWebhookData;
}

/** Confirma un SALE_APPROVED consultando el link en la API de Bold; devuelve el evento con monto de Bold o null. */
async function confirmSaleWithBold(db: SupabaseClient, rawBody: string): Promise<BoldEvent | null> {
  try {
    const event = JSON.parse(rawBody) as BoldEvent;
    if (event.type !== "SALE_APPROVED") return null;
    const reference = event.data?.metadata?.reference?.trim();
    const paymentId = event.data?.payment_id;
    if (!reference || !paymentId) return null;

    const { data: reqRow } = await db
      .from("bold_payment_requests")
      .select("payment_link")
      .eq("id", reference)
      .maybeSingle();
    if (!reqRow?.payment_link) return null;

    const status = await getBoldPaymentLinkStatus(reqRow.payment_link);
    if (status.status !== "PAID" || status.transaction_id !== paymentId || status.reference !== reference) {
      return null;
    }
    return {
      ...event,
      data: {
        ...event.data,
        amount: { currency: status.currency ?? event.data.amount?.currency, total: status.total },
      },
    };
  } catch (err) {
    console.error("[bold:webhook] no se pudo confirmar el cobro contra la API de Bold", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-bold-signature");
  const db = adminClient();

  let event: BoldEvent;
  if (verifyBoldWebhookSignature(rawBody, signature)) {
    event = JSON.parse(rawBody) as BoldEvent;
  } else {
    // Las firmas de Bold para Link de pagos no validan con ninguna llave que
    // tengamos (sep 2026: cobros reales de Newbody y Mil hojaldres quedaron sin
    // registrar). En vez de confiar en el cuerpo, confirmamos el cobro contra la
    // API de Bold con nuestra propia llave: solo si el link figura PAID con ese
    // mismo transaction_id aceptamos el evento, y usamos el monto de Bold.
    const confirmed = await confirmSaleWithBold(db, rawBody);
    if (!confirmed) {
      try {
        await db.from("bold_unmatched_events").insert({
          event_type: "DEBUG_INVALID_SIGNATURE",
          reason: "invalid_signature",
          payload: { raw_body: rawBody, signature },
        });
      } catch {
        // no-op: solo diagnóstico
      }
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
    event = confirmed;
  }

  try {
    switch (event.type) {
      case "SALE_APPROVED": {
        // 200 aunque quede unmatched: Bold no debe reintentar un evento que no
        // va a resolverse solo (ej. venta de datáfono ajena a la suscripción);
        // el registro en bold_unmatched_events queda para revisión manual.
        await applyBoldSaleApproved(db, event.data, event.type);
        break;
      }

      case "SALE_REJECTED": {
        const reference = event.data.metadata?.reference?.trim();
        if (reference) {
          const { data: updated } = await db
            .from("bold_payment_requests")
            .update({ status: "failed" })
            .eq("id", reference)
            .eq("status", "pending")
            .select("organization_id, kind, amount_usd")
            .maybeSingle();
          if (updated) {
            try {
              const { notifyBoldPaymentRejected } = await import("@/lib/email/notify-billing-status");
              const { data: org } = await db
                .from("organizations")
                .select("name")
                .eq("id", updated.organization_id)
                .maybeSingle();
              await notifyBoldPaymentRejected({
                organizationId: updated.organization_id,
                organizationName: org?.name ?? "Organización",
                kind: updated.kind,
                amountUsd: updated.amount_usd,
              });
            } catch (err) {
              console.error("[bold:webhook] no se pudo notificar el rechazo", reference, err);
            }
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[bold:webhook] error procesando evento", event.type, err);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
