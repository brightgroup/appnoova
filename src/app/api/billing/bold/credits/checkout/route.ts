import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createBoldPaymentLink, BoldApiError } from "@/lib/billing/bold/client";
import { getAppBaseUrl } from "@/lib/telephony/app-url";

/** POST { package_id } — crea un link de pago Bold en USD para comprar créditos puntuales. */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const packageId = body?.package_id as string | undefined;
  if (!packageId) {
    return NextResponse.json({ error: "package_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: pkg } = await db
    .from("credit_packages")
    .select("id, is_active, price_usd")
    .eq("id", packageId)
    .maybeSingle();

  if (!pkg || pkg.is_active === false) {
    return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
  }

  const { data: payer } = await db.from("profiles").select("email").eq("id", ctx.userId).maybeSingle();

  const amountUsd = Math.round(Number(pkg.price_usd) * 100) / 100;

  const { data: reqRow, error: insertErr } = await db
    .from("bold_payment_requests")
    .insert({
      organization_id: ctx.organizationId,
      kind: "topup",
      package_id: packageId,
      amount_cop: 0,
      amount_usd: amountUsd,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertErr || !reqRow) {
    console.error("[bold:credits-checkout] no se pudo crear bold_payment_requests", insertErr);
    return NextResponse.json({ error: "No se pudo iniciar la compra" }, { status: 500 });
  }

  try {
    const link = await createBoldPaymentLink({
      reference: reqRow.id,
      amount: amountUsd,
      currency: "USD",
      description: `Recarga de créditos — Noova 360`,
      payerEmail: payer?.email ?? undefined,
      callbackUrl: `${getAppBaseUrl()}/dashboard/facturacion`,
    });

    await db
      .from("bold_payment_requests")
      .update({ payment_link: link.payment_link, checkout_url: link.url })
      .eq("id", reqRow.id);

    return NextResponse.json({ checkout_url: link.url, request_id: reqRow.id });
  } catch (err) {
    console.error("[bold:credits-checkout]", err);
    await db.from("bold_payment_requests").update({ status: "failed" }).eq("id", reqRow.id);
    const message = err instanceof BoldApiError ? err.message : "No se pudo iniciar la compra con Bold";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
