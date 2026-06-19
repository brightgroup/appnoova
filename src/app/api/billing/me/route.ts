import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  BILLING_CHART_CATEGORIES,
  chartKeyForEvent,
  createEmptyChartDay,
  dayTotal,
  type BillingChartDay,
  USAGE_TYPE_LABELS,
} from "@/lib/billing/chart-categories";
import { resolvePlanPromo } from "@/lib/billing/plan-promo";
import {
  resolveBillingBalances,
  resolvePlanMonthlyCredits,
} from "@/lib/billing/wallet-display";

interface UsageEventRow {
  created_at: string;
  event_type: string;
  credits_charged: number;
  reference_id: string | null;
  reference_type: string | null;
}

const CHART_HISTORY_DAYS = 90;

function buildChartDays(daysBack: number): Map<string, BillingChartDay> {
  const map = new Map<string, BillingChartDay>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = createEmptyChartDay(d);
    map.set(day.dateKey, day);
  }
  return map;
}

/** GET — estado de facturación de la organización activa */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const orgId = ctx.organizationId;

  await db.rpc("billing_sync_wallet", { p_org: orgId });

  const chartFrom = new Date(Date.now() - CHART_HISTORY_DAYS * 86_400_000).toISOString();

  const [subRes, walletRes, invoicesRes, plansRes, eventsRes] = await Promise.all([
    db
      .from("organization_subscriptions")
      .select("*, plans(name, price_usd, monthly_credits, whatsapp_included, support_level)")
      .eq("organization_id", orgId)
      .maybeSingle(),
    db.from("organization_credit_wallets").select("*").eq("organization_id", orgId).maybeSingle(),
    db
      .from("billing_invoices")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(24),
    db.from("plans").select("*").order("sort_order"),
    db
      .from("usage_events")
      .select("created_at, event_type, credits_charged, reference_id, reference_type")
      .eq("organization_id", orgId)
      .gte("created_at", chartFrom)
      .order("created_at", { ascending: true }),
  ]);

  const wallet = walletRes.data;
  const plans = plansRes.data ?? [];
  const subscription = subRes.data;
  const events = (eventsRes.data ?? []) as UsageEventRow[];

  const catalogPlan = plans.find((p) => p.id === subscription?.plan_id);
  const planMonthlyCredits = resolvePlanMonthlyCredits(
    subscription,
    catalogPlan?.id,
    catalogPlan?.monthly_credits
  );
  const balances = resolveBillingBalances(wallet, planMonthlyCredits);
  const planPromo = resolvePlanPromo(subscription, catalogPlan, planMonthlyCredits);

  let usage: { event_type: string; events: number; credits: number; cost_cop: number }[] = [];
  if (wallet) {
    const { data: summary } = await db.rpc("billing_usage_summary", {
      p_org: orgId,
      p_from: wallet.period_start,
      p_to: new Date().toISOString(),
    });
    usage = (summary ?? []).map((r: Record<string, unknown>) => ({
      event_type: String(r.event_type),
      events: Number(r.events ?? 0),
      credits: Number(r.credits ?? 0),
      cost_cop: Number(r.cost_cop ?? 0),
    }));
  }

  const included = balances.included;
  const topup = balances.topup;
  const used = balances.used;
  const total = balances.total;
  const remaining = balances.remaining;

  const daysMap = buildChartDays(CHART_HISTORY_DAYS);

  events.forEach((ev) => {
    const d = new Date(ev.created_at);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateKey = `${d.getFullYear()}-${mm}-${dd}`;
    const slot = daysMap.get(dateKey);
    if (!slot) return;

    const key = chartKeyForEvent(ev.event_type);
    if (key) slot[key] += ev.credits_charged;
  });

  const dailyChart = Array.from(daysMap.values());

  const voiceIds = [...new Set(
    events.filter((e) => e.event_type === "voice" && e.reference_id).map((e) => e.reference_id!)
  )];
  const textIds = [...new Set(
    events
      .filter((e) => ["whatsapp_ai", "whatsapp_manual", "widget", "milink"].includes(e.event_type) && e.reference_id)
      .map((e) => e.reference_id!)
  )];

  const [voiceRes, textRes] = await Promise.all([
    voiceIds.length ? db.from("voice_agents").select("id, name").in("id", voiceIds) : { data: [] },
    textIds.length ? db.from("text_agents").select("id, name").in("id", textIds) : { data: [] },
  ]);

  const agentNames = new Map<string, string>();
  (voiceRes.data ?? []).forEach((a) => agentNames.set(a.id, a.name));
  (textRes.data ?? []).forEach((a) => agentNames.set(a.id, a.name));

  const detailsMap = new Map<string, { id: string; name: string; type: string; credits: number }>();
  events.forEach((ev, idx) => {
    const refId = ev.reference_id ?? "global";
    const key = `${ev.event_type}-${refId}`;
    const agentName = ev.reference_id ? (agentNames.get(ev.reference_id) ?? null) : null;
    const type = USAGE_TYPE_LABELS[ev.event_type] ?? ev.event_type;

    let name: string;
    switch (ev.event_type) {
      case "voice":
        name = agentName ? `${agentName} — Voz` : "Agente de Voz";
        break;
      case "whatsapp_ai":
        name = agentName ? `${agentName} — WhatsApp IA` : "WhatsApp con IA";
        break;
      case "whatsapp_manual":
        name = agentName ? `${agentName} — WhatsApp` : "WhatsApp manual";
        break;
      case "widget":
        name = agentName ? `${agentName} — Widget` : "Widget web";
        break;
      case "milink":
        name = agentName ? `${agentName} — Mi Link` : "Mi Link";
        break;
      case "ori":
        name = "ORI (copiloto)";
        break;
      case "text_test":
        name = "Prueba de agente";
        break;
      case "doc_scan":
        name = "Escaneo de documento";
        break;
      case "form_fill":
        name = "Llenado de formulario";
        break;
      case "quote":
        name = "Cotización generada";
        break;
      default:
        name = ev.event_type;
    }

    const existing = detailsMap.get(key);
    if (existing) {
      existing.credits += ev.credits_charged;
    } else {
      detailsMap.set(key, { id: `${key}-${idx}`, name, type, credits: ev.credits_charged });
    }
  });

  const usageDetails = Array.from(detailsMap.values()).sort((a, b) => b.credits - a.credits);

  const categoryTotals = Object.fromEntries(
    BILLING_CHART_CATEGORIES.map((c) => [c.key, 0])
  ) as Record<(typeof BILLING_CHART_CATEGORIES)[number]["key"], number>;

  dailyChart.forEach((d) => {
    BILLING_CHART_CATEGORIES.forEach((c) => {
      categoryTotals[c.key] += d[c.key];
    });
  });

  let peakDay = 0;
  let peakDayLabel = "—";
  dailyChart.forEach((d) => {
    const t = dayTotal(d);
    if (t > peakDay) {
      peakDay = t;
      peakDayLabel = d.dayStr;
    }
  });

  const last30 = dailyChart.slice(-30);
  const usedLast30 = last30.reduce((s, d) => s + dayTotal(d), 0);
  const avgDaily30 = last30.length > 0 ? Math.round(usedLast30 / last30.length) : 0;

  return NextResponse.json({
    organization: { id: orgId, name: ctx.organizationName },
    subscription: subscription ?? null,
    plan_monthly_credits: planMonthlyCredits,
    plan_promo: planPromo,
    wallet: wallet
      ? {
          period_start: wallet.period_start,
          period_end: wallet.period_end,
          included_credits: included,
          topup_credits: topup,
          used_credits: used,
          total_credits: total,
          remaining_credits: remaining,
          used_pct: balances.usedPct,
        }
      : null,
    usage,
    invoices: invoicesRes.data ?? [],
    plans,
    daily_chart: dailyChart,
    usage_details: usageDetails,
    stats: {
      avg_daily: avgDaily30,
      peak_daily: peakDay,
      peak_day_label: peakDayLabel,
      category_totals: categoryTotals,
    },
  });
}
