import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPaddleCustomer,
  getPaddleTransaction,
  type PaddleTransaction,
} from "@/lib/billing/paddle/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CustomData = {
  organization_id?: string;
  plan_id?: string;
  kind?: string;
  package_id?: string;
};

function asCustomData(raw: Record<string, unknown> | null | undefined): CustomData {
  if (!raw) return {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    organization_id: str(raw.organization_id),
    plan_id: str(raw.plan_id),
    kind: str(raw.kind),
    package_id: str(raw.package_id),
  };
}

function priceColumn(): "paddle_price_id_live" | "paddle_price_id_sandbox" {
  return process.env.PADDLE_ENV === "live" ? "paddle_price_id_live" : "paddle_price_id_sandbox";
}

async function recordUnmatched(
  db: SupabaseClient,
  reason: string,
  txn: PaddleTransaction,
  eventType: string
) {
  console.error("[paddle:webhook] pago no asociado a una org", reason, txn.id);
  const { error } = await db.from("paddle_unmatched_events").insert({
    event_type: eventType,
    paddle_transaction_id: txn.id,
    paddle_customer_id: txn.customer_id ?? null,
    reason,
    payload: {
      customer_id: txn.customer_id ?? null,
      subscription_id: txn.subscription_id ?? null,
      custom_data: txn.custom_data ?? null,
      price_id: txn.items?.[0]?.price?.id ?? null,
    },
  });
  if (error) console.error("[paddle:webhook] no se pudo guardar unmatched", error);
}

async function resolveOrgId(
  db: SupabaseClient,
  txn: PaddleTransaction,
  custom: CustomData
): Promise<string | null> {
  if (custom.organization_id && UUID_RE.test(custom.organization_id)) {
    const { data } = await db
      .from("organizations")
      .select("id")
      .eq("id", custom.organization_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (txn.customer_id) {
    const { data: byCustomer } = await db
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("paddle_customer_id", txn.customer_id)
      .limit(2);
    const ids = [...new Set((byCustomer ?? []).map((r) => r.organization_id).filter(Boolean))];
    if (ids.length === 1) return ids[0];
  }

  let email: string | null = txn.customer?.email ?? null;
  if (!email && txn.customer_id) {
    try {
      const customer = await getPaddleCustomer(txn.customer_id);
      email = customer.email ?? null;
    } catch (err) {
      console.warn("[paddle:webhook] no se pudo leer customer de Paddle", txn.customer_id, err);
    }
  }
  if (!email) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!profile?.id) return null;

  const { data: memberships } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", profile.id)
    .eq("status", "active");
  const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
  if (orgIds.length === 1) return orgIds[0];
  if (orgIds.length === 0) return null;

  const { data: unpaid } = await db
    .from("billing_invoices")
    .select("organization_id")
    .in("organization_id", orgIds)
    .in("status", ["pending", "overdue"]);
  const unpaidOrgs = [...new Set((unpaid ?? []).map((r) => r.organization_id))];
  if (unpaidOrgs.length === 1) return unpaidOrgs[0];

  return null;
}

async function resolvePlanId(
  db: SupabaseClient,
  organizationId: string,
  priceId: string,
  requestedPlanId: string | undefined
): Promise<string | null> {
  const col = priceColumn();
  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("plan_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (sub?.plan_id) {
    const { data: currentPlan } = await db
      .from("plans")
      .select("id, paddle_price_id_live, paddle_price_id_sandbox")
      .eq("id", sub.plan_id)
      .maybeSingle();
    const currentPrice = currentPlan?.[col];
    if (currentPrice && currentPrice === priceId) {
      return sub.plan_id;
    }
  }

  if (requestedPlanId) {
    const { data: requested } = await db.from("plans").select("id").eq("id", requestedPlanId).maybeSingle();
    if (requested?.id) return requested.id;
  }

  const { data: byPrice } = await db.from("plans").select("id").eq(col, priceId);
  if (byPrice?.length === 1) return byPrice[0].id;
  if (sub?.plan_id && byPrice?.some((p) => p.id === sub.plan_id)) return sub.plan_id;
  return byPrice?.[0]?.id ?? null;
}

export async function applyPaddleTransactionCompleted(
  db: SupabaseClient,
  eventTxn: PaddleTransaction,
  eventType = "transaction.completed"
): Promise<{ ok: true } | { ok: false; unmatched: true }> {
  let txn = eventTxn;
  try {
    const fresh = await getPaddleTransaction(eventTxn.id);
    txn = {
      ...eventTxn,
      ...fresh,
      custom_data: fresh.custom_data ?? eventTxn.custom_data,
      customer: fresh.customer ?? eventTxn.customer,
    };
  } catch (err) {
    console.warn("[paddle:webhook] no se pudo refrescar transacción", eventTxn.id, err);
  }

  const custom = asCustomData(txn.custom_data);
  const priceId = txn.items?.[0]?.price?.id;
  const organizationId = await resolveOrgId(db, txn, custom);

  if (!organizationId || !priceId) {
    await recordUnmatched(
      db,
      !organizationId ? "missing_organization" : "missing_price_id",
      txn,
      eventType
    );
    return { ok: false, unmatched: true };
  }

  if (custom.kind === "topup") {
    const packageId = custom.package_id;
    const { data: pkg } = await db
      .from("credit_packages")
      .select("credits")
      .eq("id", packageId ?? "")
      .maybeSingle();
    if (!pkg) {
      await recordUnmatched(db, `topup_unknown_package:${packageId ?? ""}`, txn, eventType);
      return { ok: false, unmatched: true };
    }
    const { error } = await db.rpc("billing_admin_add_credits", {
      p_org: organizationId,
      p_credits: pkg.credits,
      p_reason: `Compra de créditos (Paddle transaction ${txn.id})`,
    });
    if (error) throw error;
    return { ok: true };
  }

  const planId = await resolvePlanId(db, organizationId, priceId, custom.plan_id);
  if (!planId) {
    await recordUnmatched(db, `unmapped_price:${priceId}`, txn, eventType);
    return { ok: false, unmatched: true };
  }

  const rawTotal = Number(txn.details?.totals?.total ?? "0") / 100;
  let amountUsd = rawTotal;
  if (txn.currency_code && txn.currency_code !== "USD") {
    const { data: planRow } = await db.from("plans").select("price_usd").eq("id", planId).maybeSingle();
    amountUsd = Number(planRow?.price_usd ?? rawTotal);
  }
  const periodStart = txn.billing_period?.starts_at ?? new Date().toISOString();
  const periodEnd =
    txn.billing_period?.ends_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

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

  try {
    const [{ data: org }, { data: invoice }] = await Promise.all([
      db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      db
        .from("billing_invoices")
        .select("id")
        .eq("paddle_transaction_id", txn.id)
        .maybeSingle(),
    ]);
    const { notifyPaddlePaymentRecorded } = await import("@/lib/email/notify-paddle-payment");
    await notifyPaddlePaymentRecorded({
      organizationId,
      organizationName: org?.name ?? "Organización",
      planId,
      amountUsd,
      paddleTransactionId: txn.id,
      invoiceId: invoice?.id ?? null,
    });
  } catch (err) {
    console.error("[paddle:webhook] pago aplicado pero falló el email", txn.id, err);
  }

  return { ok: true };
}
