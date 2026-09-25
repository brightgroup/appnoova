import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createBoldPaymentLink, BoldApiError } from "@/lib/billing/bold/client";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { fetchBillingProfile, isBillingProfileComplete } from "@/lib/billing/billing-profile";

/**
 * POST { invoice_id } | { all_unpaid: true } — crea UN link de pago Bold que
 * salda una factura, o todas las pendientes/vencidas de la org en un solo
 * cobro. A diferencia de `/api/billing/bold/checkout` (pagar el plan, que abre
 * un periodo nuevo), aquí solo se saldan esas facturas: el webhook marca cada
 * una pagada vía `billing_record_invoice_payment` y la cuenta se reactiva
 * únicamente cuando ya no le queda ninguna impaga.
 *
 * Se cobra en COP por la suma de `amount_cop` (el valor en pesos que el
 * cliente ve en sus facturas); solo si alguna no trae monto en COP y es una
 * única factura se cobra en USD.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const invoiceId = body?.invoice_id as string | undefined;
  const allUnpaid = body?.all_unpaid === true;
  if (!invoiceId && !allUnpaid) {
    return NextResponse.json({ error: "invoice_id o all_unpaid requerido" }, { status: 400 });
  }

  const db = adminClient();
  let query = db
    .from("billing_invoices")
    .select("id, status, currency, amount_usd, amount_cop, description")
    .eq("organization_id", ctx.organizationId)
    .in("status", ["pending", "overdue"])
    .order("period_start", { ascending: true });
  if (invoiceId) query = query.eq("id", invoiceId);
  const { data: invoices } = await query;

  if (!invoices?.length) {
    return NextResponse.json(
      { error: invoiceId ? "Esta factura no tiene saldo por pagar" : "No tienes facturas pendientes" },
      { status: 422 }
    );
  }

  const allHaveCop = invoices.every((inv) => Math.round(Number(inv.amount_cop) || 0) > 0);
  if (!allHaveCop && invoices.length > 1) {
    return NextResponse.json({ error: "Paga estas facturas una por una desde la pestaña Facturas" }, { status: 422 });
  }
  const amountCop = invoices.reduce((sum, inv) => sum + Math.round(Number(inv.amount_cop) || 0), 0);
  const amountUsd = Math.round(invoices.reduce((sum, inv) => sum + Number(inv.amount_usd || 0), 0) * 100) / 100;
  const isCop = allHaveCop;
  if (isCop ? !(amountCop > 0) : !(amountUsd > 0)) {
    return NextResponse.json({ error: "No hay monto por cobrar" }, { status: 422 });
  }

  const billingProfile = await fetchBillingProfile(db, ctx.organizationId);
  if (!isBillingProfileComplete(billingProfile)) {
    return NextResponse.json(
      { error: "Completa los datos de facturación de tu organización antes de pagar", code: "billing_profile_incomplete" },
      { status: 428 }
    );
  }

  const { data: payer } = await db.from("profiles").select("email").eq("id", ctx.userId).maybeSingle();

  const invoiceIds = invoices.map((inv) => inv.id as string);
  const { data: reqRow, error: insertErr } = await db
    .from("bold_payment_requests")
    .insert({
      organization_id: ctx.organizationId,
      kind: "invoice",
      invoice_id: invoiceIds.length === 1 ? invoiceIds[0] : null,
      invoice_ids: invoiceIds,
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
    const description =
      invoices.length === 1
        ? invoices[0].description || `Factura ${String(invoices[0].id).substring(0, 8).toUpperCase()}`
        : `${invoices.length} facturas pendientes`;
    const link = await createBoldPaymentLink({
      reference: reqRow.id,
      amount: isCop ? amountCop : amountUsd,
      currency: isCop ? "COP" : "USD",
      description: `${description} — Noova 360`.slice(0, 100),
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
    const message = err instanceof BoldApiError ? err.message : "No se pudo iniciar el pago";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
