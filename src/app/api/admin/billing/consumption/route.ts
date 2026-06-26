import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  BILLING_CHART_CATEGORIES,
  chartKeyForEvent,
  createEmptyChartDay,
  type BillingChartDay,
} from "@/lib/billing/chart-categories";
import { resolveConsumptionRange } from "@/lib/billing/consumption-range";
import { ensurePricingConfig } from "@/lib/billing/pricing-config";

interface OrgConsumptionRow {
  organization_id: string;
  org_name: string;
  plan_id: string | null;
  sub_status: string | null;
  event_type: string;
  events: number;
  credits: number;
  cost_usd: number;
  cost_cop: number;
}

interface ServiceCell {
  credits: number;
  cost_usd: number;
  events: number;
}

export interface AdminConsumptionClientRow {
  organization_id: string;
  name: string;
  plan_id: string | null;
  status: string | null;
  services: Record<string, ServiceCell>;
  total_credits: number;
  total_cost_usd: number;
  total_cost_cop: number;
  total_events: number;
}

function buildChartDays(fromIso: string, toIso: string): Map<string, BillingChartDay> {
  const map = new Map<string, BillingChartDay>();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < to) {
    const day = createEmptyChartDay(cursor);
    map.set(day.dateKey, day);
    cursor.setDate(cursor.getDate() + 1);
  }
  return map;
}

/** GET — consumo cross-org con costo USD y filtros de fecha */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const range = resolveConsumptionRange(rangeParam);

  const db = adminClient();
  const pricing = await ensurePricingConfig(db);

  const [byOrgRes, totalsRes, dailyRes] = await Promise.all([
    db.rpc("billing_admin_consumption_by_org", {
      p_from: range.from,
      p_to: range.to,
    }),
    db.rpc("billing_admin_consumption_totals", {
      p_from: range.from,
      p_to: range.to,
    }),
    db.rpc("billing_admin_consumption_daily", {
      p_from: range.from,
      p_to: range.to,
    }),
  ]);

  if (byOrgRes.error) {
    return NextResponse.json({ error: byOrgRes.error.message }, { status: 500 });
  }
  if (totalsRes.error) {
    return NextResponse.json({ error: totalsRes.error.message }, { status: 500 });
  }
  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const rawRows = (byOrgRes.data ?? []) as OrgConsumptionRow[];
  const clientMap = new Map<string, AdminConsumptionClientRow>();

  for (const row of rawRows) {
    const orgId = String(row.organization_id);
    let client = clientMap.get(orgId);
    if (!client) {
      client = {
        organization_id: orgId,
        name: row.org_name,
        plan_id: row.plan_id,
        status: row.sub_status,
        services: {},
        total_credits: 0,
        total_cost_usd: 0,
        total_cost_cop: 0,
        total_events: 0,
      };
      clientMap.set(orgId, client);
    }

    const chartKey = chartKeyForEvent(row.event_type);
    const serviceKey = chartKey ?? row.event_type;
    const credits = Number(row.credits ?? 0);
    const costUsd = Number(row.cost_usd ?? 0);
    const costCop = Number(row.cost_cop ?? 0);
    const events = Number(row.events ?? 0);

    const existing = client.services[serviceKey] ?? { credits: 0, cost_usd: 0, events: 0 };
    client.services[serviceKey] = {
      credits: existing.credits + credits,
      cost_usd: existing.cost_usd + costUsd,
      events: existing.events + events,
    };

    client.total_credits += credits;
    client.total_cost_usd += costUsd;
    client.total_cost_cop += costCop;
    client.total_events += events;
  }

  const clients = Array.from(clientMap.values()).sort(
    (a, b) => b.total_cost_usd - a.total_cost_usd || b.total_credits - a.total_credits
  );

  const byService = BILLING_CHART_CATEGORIES.map((cat) => {
    let credits = 0;
    let cost_usd = 0;
    let events = 0;
    for (const client of clients) {
      const cell = client.services[cat.key];
      if (!cell) continue;
      credits += cell.credits;
      cost_usd += cell.cost_usd;
      events += cell.events;
    }
    return { key: cat.key, label: cat.label, color: cat.color, credits, cost_usd, events };
  }).filter((s) => s.credits > 0 || s.cost_usd > 0);

  const daysMap = buildChartDays(range.from, range.to);
  for (const row of dailyRes.data ?? []) {
    const dayStr = String(row.day);
    const dateKey = dayStr.slice(0, 10);
    const slot = daysMap.get(dateKey);
    if (!slot) continue;
    const key = chartKeyForEvent(String(row.event_type));
    if (!key) continue;
    slot[key] += Number(row.credits ?? 0);
  }

  const dailyChart = Array.from(daysMap.values());

  const daysCostMap = buildChartDays(range.from, range.to);
  for (const row of dailyRes.data ?? []) {
    const dateKey = String(row.day).slice(0, 10);
    const slot = daysCostMap.get(dateKey);
    if (!slot) continue;
    const key = chartKeyForEvent(String(row.event_type));
    if (!key) continue;
    slot[key] += Number(row.cost_usd ?? 0);
  }
  const dailyCostChart = Array.from(daysCostMap.values());

  const dailyCostUsd: { dateKey: string; dayLabel: string; cost_usd: number }[] = [];
  const costByDay = new Map<string, number>();
  for (const row of dailyRes.data ?? []) {
    const dateKey = String(row.day).slice(0, 10);
    costByDay.set(dateKey, (costByDay.get(dateKey) ?? 0) + Number(row.cost_usd ?? 0));
  }
  for (const day of dailyChart) {
    dailyCostUsd.push({
      dateKey: day.dateKey,
      dayLabel: day.dayLabel,
      cost_usd: costByDay.get(day.dateKey) ?? 0,
    });
  }

  const t = totalsRes.data?.[0] ?? {};

  return NextResponse.json({
    trm_cop: pricing.trmCop,
    credit_usd_value: pricing.creditUsdValue,
    range,
    totals: {
      events: Number(t.events ?? 0),
      credits: Number(t.credits ?? 0),
      cost_usd: Number(t.cost_usd ?? 0),
      cost_cop: Number(t.cost_cop ?? 0),
      twilio_cost_usd: Number(t.twilio_cost_usd ?? 0),
      google_cost_usd: Number(t.google_cost_usd ?? 0),
      telnyx_cost_usd: Number(t.telnyx_cost_usd ?? 0),
      elevenlabs_cost_usd: Number(t.elevenlabs_cost_usd ?? 0),
    },
    by_service: byService,
    daily_chart: dailyChart,
    daily_cost_chart: dailyCostChart,
    daily_cost_usd: dailyCostUsd,
    clients,
  });
}
