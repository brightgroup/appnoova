import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { applyBoldSaleApproved, type BoldWebhookData } from "@/lib/billing/bold/apply-completed-payment";
import { verifyBoldWebhookSignature } from "@/lib/billing/bold/webhook-verify";

interface BoldEvent {
  id: string;
  type: "SALE_APPROVED" | "SALE_REJECTED" | "VOID_APPROVED" | "VOID_REJECTED";
  subject: string;
  data: BoldWebhookData;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-bold-signature");

  if (!verifyBoldWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as BoldEvent;
  const db = adminClient();

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
