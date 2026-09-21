import type { SupabaseClient } from "@supabase/supabase-js";
import { getPricingConfig } from "@/lib/billing/pricing-config";
import { emitSiigoInvoiceForPayment } from "@/lib/billing/siigo/invoice";

export interface BoldWebhookData {
  payment_id: string;
  amount: { currency: string; total: number };
  metadata?: { reference?: string | null } | null;
  payer_email?: string | null;
  payment_method?: string;
  integration?: string;
}

async function recordUnmatched(
  db: SupabaseClient,
  eventType: string,
  data: BoldWebhookData,
  reason: string
) {
  console.error("[bold:webhook] evento no asociado a un cobro nuestro", reason, data.payment_id);
  const { error } = await db.from("bold_unmatched_events").insert({
    event_type: eventType,
    bold_payment_id: data.payment_id ?? null,
    reference: data.metadata?.reference ?? null,
    reason,
    payload: data,
  });
  if (error) console.error("[bold:webhook] no se pudo guardar unmatched", error);
}

/** Un mes calendario después de `from` (mismo criterio que billing_bootstrap_subscription). */
function addOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * Resuelve el monto real cobrado en USD y su equivalente en COP a partir de
 * lo que Bold reportó en el webhook. Cobramos siempre en USD (moneda
 * multidivisa de Bold), pero si la tarjeta del pagador no soporta USD, Bold
 * hace fallback a COP por su cuenta — en ese caso usamos el USD que ya
 * habíamos cotizado en `bold_payment_requests` como referencia.
 */
function resolveChargedAmounts(
  data: BoldWebhookData,
  reqRow: { amount_usd: number | null; amount_cop: number | null }
): { amountUsd: number; amountCop: number } {
  const total = data.amount?.total;
  const currency = data.amount?.currency?.toUpperCase();
  if (typeof total === "number" && currency === "USD") {
    const trmCop = getPricingConfig().trmCop;
    return { amountUsd: total, amountCop: Math.round(total * trmCop) };
  }
  if (typeof total === "number" && currency === "COP") {
    return { amountUsd: reqRow.amount_usd ?? 0, amountCop: total };
  }
  return { amountUsd: reqRow.amount_usd ?? 0, amountCop: reqRow.amount_cop ?? 0 };
}

/**
 * Procesa un evento `SALE_APPROVED` de Bold: resuelve a qué `bold_payment_requests`
 * corresponde vía `metadata.reference` (el id de esa misma fila, que nosotros
 * enviamos como `reference` al crear el link) y aplica el pago — plan o
 * recarga de créditos — de forma idempotente por `bold_transaction_id`.
 */
export async function applyBoldSaleApproved(
  db: SupabaseClient,
  data: BoldWebhookData,
  eventType = "SALE_APPROVED"
): Promise<{ ok: true } | { ok: false; unmatched: true }> {
  const reference = data.metadata?.reference?.trim();
  if (!reference) {
    await recordUnmatched(db, eventType, data, "missing_reference");
    return { ok: false, unmatched: true };
  }

  const { data: reqRow } = await db
    .from("bold_payment_requests")
    .select("*")
    .eq("id", reference)
    .maybeSingle();

  if (!reqRow) {
    await recordUnmatched(db, eventType, data, `unknown_reference:${reference}`);
    return { ok: false, unmatched: true };
  }

  // Idempotencia: Bold puede reenviar la misma notificación varias veces.
  if (reqRow.status === "paid" && reqRow.bold_transaction_id === data.payment_id) {
    return { ok: true };
  }

  if (reqRow.kind === "topup") {
    const { data: pkg } = await db
      .from("credit_packages")
      .select("credits")
      .eq("id", reqRow.package_id ?? "")
      .maybeSingle();
    if (!pkg) {
      await recordUnmatched(db, eventType, data, `topup_unknown_package:${reqRow.package_id ?? ""}`);
      return { ok: false, unmatched: true };
    }
    const { error } = await db.rpc("billing_admin_add_credits", {
      p_org: reqRow.organization_id,
      p_credits: pkg.credits,
      p_reason: `Compra de créditos (Bold payment ${data.payment_id})`,
    });
    if (error) throw error;
  } else {
    if (!reqRow.plan_id) {
      await recordUnmatched(db, eventType, data, "plan_request_missing_plan_id");
      return { ok: false, unmatched: true };
    }
    const periodStart = new Date();
    const periodEnd = addOneMonth(periodStart);
    const { amountUsd, amountCop } = resolveChargedAmounts(data, reqRow);
    const { error } = await db.rpc("billing_record_bold_payment", {
      p_org: reqRow.organization_id,
      p_plan_id: reqRow.plan_id,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_amount_cop: amountCop,
      p_amount_usd: amountUsd,
      p_bold_transaction_id: data.payment_id,
    });
    if (error) throw error;
  }

  await db
    .from("bold_payment_requests")
    .update({ status: "paid", bold_transaction_id: data.payment_id, paid_at: new Date().toISOString() })
    .eq("id", reqRow.id);

  try {
    const { notifyBoldPaymentRecorded } = await import("@/lib/email/notify-bold-payment");
    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", reqRow.organization_id)
      .maybeSingle();
    const { amountUsd, amountCop } = resolveChargedAmounts(data, reqRow);
    await notifyBoldPaymentRecorded({
      organizationId: reqRow.organization_id,
      organizationName: org?.name ?? "Organización",
      kind: reqRow.kind,
      planId: reqRow.plan_id,
      amountUsd,
      amountCop,
      boldPaymentId: data.payment_id,
    });
  } catch (err) {
    console.error("[bold:webhook] pago aplicado pero falló el email", data.payment_id, err);
  }

  if (reqRow.kind === "plan" && reqRow.plan_id) {
    try {
      const [{ data: org }, { data: plan }, { data: invoiceRow }] = await Promise.all([
        db.from("organizations").select("name").eq("id", reqRow.organization_id).maybeSingle(),
        db.from("plans").select("name").eq("id", reqRow.plan_id).maybeSingle(),
        db.from("billing_invoices").select("id").eq("bold_transaction_id", data.payment_id).maybeSingle(),
      ]);
      const { amountCop } = resolveChargedAmounts(data, reqRow);
      await emitSiigoInvoiceForPayment(db, {
        organizationId: reqRow.organization_id,
        organizationName: org?.name ?? "Organización",
        planName: plan?.name ?? reqRow.plan_id,
        amountCop,
        billingInvoiceId: invoiceRow?.id ?? null,
      });
    } catch (err) {
      console.error("[bold:webhook] pago aplicado pero falló la factura Siigo", data.payment_id, err);
      const message = err instanceof Error ? err.message : String(err);
      await db
        .from("billing_invoices")
        .update({ siigo_invoice_error: message.slice(0, 500) })
        .eq("bold_transaction_id", data.payment_id);
    }
  }

  return { ok: true };
}
