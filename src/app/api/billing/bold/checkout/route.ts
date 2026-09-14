import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createBoldPaymentLink, BoldApiError } from "@/lib/billing/bold/client";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { isSuperAdminUser } from "@/lib/admin-server";
import { isInternalCheckoutPlan } from "@/lib/billing/plan-visibility";

/**
 * POST { plan_id } — crea un link de pago Bold para pagar/cambiar de plan.
 * Se cobra en USD (moneda multidivisa de Bold): el cliente ve y paga el mismo
 * precio en dólares del catálogo, Bold se encarga de convertir y liquidar en
 * pesos a la cuenta bancaria del comercio automáticamente (o si la tarjeta no
 * admite USD, Bold hace el fallback a COP por su cuenta).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const planId = body?.plan_id as string | undefined;
  if (!planId) {
    return NextResponse.json({ error: "plan_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: plan } = await db
    .from("plans")
    .select("id, name, is_public, is_system, is_active, features, price_usd")
    .eq("id", planId)
    .maybeSingle();

  if (!plan || plan.is_active === false) {
    return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
  }
  if (!(plan.price_usd > 0)) {
    return NextResponse.json({ error: "Este plan no requiere pago" }, { status: 422 });
  }

  const { data: currentSub } = await db
    .from("organization_subscriptions")
    .select("plan_id")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const isCurrentPlan = currentSub?.plan_id === planId;

  if (!isCurrentPlan && (isInternalCheckoutPlan(plan) || (plan.is_public !== true && plan.is_system !== true))) {
    const superAdmin = await isSuperAdminUser(ctx.userId);
    if (!superAdmin) {
      return NextResponse.json({ error: "Plan no disponible" }, { status: 403 });
    }
  }

  const { data: payer } = await db.from("profiles").select("email").eq("id", ctx.userId).maybeSingle();

  const amountUsd = Math.round(Number(plan.price_usd) * 100) / 100;

  const { data: reqRow, error: insertErr } = await db
    .from("bold_payment_requests")
    .insert({
      organization_id: ctx.organizationId,
      kind: "plan",
      plan_id: planId,
      amount_cop: 0,
      amount_usd: amountUsd,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertErr || !reqRow) {
    console.error("[bold:checkout] no se pudo crear bold_payment_requests", insertErr);
    return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 500 });
  }

  try {
    const link = await createBoldPaymentLink({
      reference: reqRow.id,
      amount: amountUsd,
      currency: "USD",
      description: `Plan ${plan.name} — Noova 360`,
      payerEmail: payer?.email ?? undefined,
      callbackUrl: `${getAppBaseUrl()}/dashboard/facturacion`,
    });

    await db
      .from("bold_payment_requests")
      .update({ payment_link: link.payment_link, checkout_url: link.url })
      .eq("id", reqRow.id);

    return NextResponse.json({ checkout_url: link.url, request_id: reqRow.id });
  } catch (err) {
    console.error("[bold:checkout]", err);
    await db.from("bold_payment_requests").update({ status: "failed" }).eq("id", reqRow.id);
    const message = err instanceof BoldApiError ? err.message : "No se pudo iniciar el checkout con Bold";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
