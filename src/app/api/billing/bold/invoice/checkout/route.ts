import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createBoldPaymentLink, BoldApiError } from "@/lib/billing/bold/client";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { fetchBillingProfile, isBillingProfileComplete } from "@/lib/billing/billing-profile";

/**
 * POST { invoice_id } — crea un link de pago Bold para UNA factura pendiente o
 * vencida de la org. A diferencia de `/api/billing/bold/checkout` (pagar el
 * plan, que abre un periodo nuevo), aquí solo se salda esa factura: el webhook
 * la marca pagada vía `billing_record_invoice_payment` y la cuenta se reactiva
 * únicamente cuando ya no le queda ninguna otra factura impaga.
 *
 * Se cobra en COP por el `amount_cop` de la factura (el valor en pesos que el
 * cliente ve en su factura); solo si no tiene monto en COP se cobra en USD.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const invoiceId = body?.invoice_id as string | undefined;
  if (!invoiceId) {
    return NextResponse.json({ error: "invoice_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: invoice } = await db
    .from("billing_invoices")
    .select("id, organization_id, status, currency, amount_usd, amount_cop, description, period_start, period_end")
    .eq("id", invoiceId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }
  if (invoice.status !== "pending" && invoice.status !== "overdue") {
    return NextResponse.json({ error: "Esta factura no tiene saldo por pagar" }, { status: 422 });
  }

  const amountCop = Math.round(Number(invoice.amount_cop) || 0);
  const isCop = invoice.currency === "COP" || amountCop > 0;
  const amountUsd = Math.round(Number(invoice.amount_usd) * 100) / 100;
  if (isCop ? !(amountCop > 0) : !(amountUsd > 0)) {
    return NextResponse.json({ error: "Esta factura no tiene monto por cobrar" }, { status: 422 });
  }

  const billingProfile = await fetchBillingProfile(db, ctx.organizationId);
  if (!isBillingProfileComplete(billingProfile)) {
    return NextResponse.json(
      { error: "Completa los datos de facturación de tu organización antes de pagar", code: "billing_profile_incomplete" },
      { status: 428 }
    );
  }

  const { data: payer } = await db.from("profiles").select("email").eq("id", ctx.userId).maybeSingle();

  const { data: reqRow, error: insertErr } = await db
    .from("bold_payment_requests")
    .insert({
      organization_id: ctx.organizationId,
      kind: "invoice",
      invoice_id: invoice.id,
      amount_cop: isCop ? amountCop : 0,
      amount_usd: amountUsd,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertErr || !reqRow) {
    console.error("[bold:invoice-checkout] no se pudo crear bold_payment_requests", insertErr);
    return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 500 });
  }

  try {
    const ref = String(invoice.id).substring(0, 8).toUpperCase();
    const link = await createBoldPaymentLink({
      reference: reqRow.id,
      amount: isCop ? amountCop : amountUsd,
      currency: isCop ? "COP" : "USD",
      description: `${invoice.description || `Factura ${ref}`} — Noova 360`.slice(0, 100),
      payerEmail: payer?.email ?? undefined,
      callbackUrl: `${getAppBaseUrl()}/dashboard/facturacion`,
    });

    await db
      .from("bold_payment_requests")
      .update({ payment_link: link.payment_link, checkout_url: link.url })
      .eq("id", reqRow.id);

    return NextResponse.json({ checkout_url: link.url, request_id: reqRow.id });
  } catch (err) {
    console.error("[bold:invoice-checkout]", err);
    await db.from("bold_payment_requests").update({ status: "failed" }).eq("id", reqRow.id);
    const message = err instanceof BoldApiError ? err.message : "No se pudo iniciar el checkout con Bold";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
