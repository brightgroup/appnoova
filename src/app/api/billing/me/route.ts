import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";

interface UsageEventRow {
  created_at: string;
  event_type: string;
  credits_charged: number;
  reference_id: string | null;
  reference_type: string | null;
}

/** GET — estado de facturación de la organización activa */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const orgId = ctx.organizationId;

  await db.rpc("billing_sync_wallet", { p_org: orgId });

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
      .order("created_at", { ascending: true })
  ]);

  const wallet = walletRes.data;
  const plans = plansRes.data ?? [];
  const events = (eventsRes.data ?? []) as UsageEventRow[];

  // ── Resumen de consumo por tipo (para compatibilidad) ────────────────────
  let usage: { event_type: string; events: number; credits: number; cost_cop: number }[] = [];
  if (wallet) {
    const { data: summary } = await db.rpc("billing_usage_summary", {
      p_org: orgId,
      p_from: wallet.period_start,
      p_to: new Date().toISOString()
    });
    usage = (summary ?? []).map((r: Record<string, unknown>) => ({
      event_type: String(r.event_type),
      events: Number(r.events ?? 0),
      credits: Number(r.credits ?? 0),
      cost_cop: Number(r.cost_cop ?? 0)
    }));
  }

  const included = Number(wallet?.included_credits ?? 0);
  const topup    = Number(wallet?.topup_credits ?? 0);
  const used     = Number(wallet?.used_credits ?? 0);
  const total    = included + topup;
  const remaining = total - used;

  // ── Rango de días del periodo para el gráfico ────────────────────────────
  const periodStart = wallet ? new Date(wallet.period_start) : new Date(Date.now() - 30 * 24 * 3600_000);
  const periodEnd   = wallet ? new Date(wallet.period_end)   : new Date();

  const daysMap = new Map<string, {
    dayStr: string;
    dateKey: string;
    web:      number;   // ORI, Mi Link, Widget, pruebas
    whatsapp: number;   // WhatsApp IA y manual
    voz:      number;   // llamadas de voz
    flujos:   number;   // formularios, cotizaciones, documentos
    otros:    number;
  }>();

  const cursor = new Date(periodStart);
  let dayCount = 0;
  while (cursor <= periodEnd && dayCount < 32) {
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const dateKey = `${cursor.getFullYear()}-${mm}-${dd}`;
    daysMap.set(dateKey, { dayStr: `${mm}/${dd}`, dateKey, web: 0, whatsapp: 0, voz: 0, flujos: 0, otros: 0 });
    cursor.setDate(cursor.getDate() + 1);
    dayCount++;
  }

  // Fallback: últimos 15 días si el periodo estaba vacío
  if (daysMap.size === 0) {
    for (let i = 14; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateKey = `${d.getFullYear()}-${mm}-${dd}`;
      daysMap.set(dateKey, { dayStr: `${mm}/${dd}`, dateKey, web: 0, whatsapp: 0, voz: 0, flujos: 0, otros: 0 });
    }
  }

  // Distribuir eventos reales en los días
  events.forEach((ev) => {
    const d  = new Date(ev.created_at);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateKey = `${d.getFullYear()}-${mm}-${dd}`;
    const slot = daysMap.get(dateKey);
    if (!slot) return;

    const cr   = ev.credits_charged;
    const type = ev.event_type;

    if (["ori", "milink", "widget", "text_test"].includes(type)) {
      slot.web += cr;
    } else if (["whatsapp_ai", "whatsapp_manual"].includes(type)) {
      slot.whatsapp += cr;
    } else if (type === "voice") {
      slot.voz += cr;
    } else if (["form_fill", "quote", "doc_scan"].includes(type)) {
      slot.flujos += cr;
    } else {
      slot.otros += cr;
    }
  });

  const dailyChart = Array.from(daysMap.values());

  // ── Resolución de nombres de agentes para Usage Details ──────────────────
  const voiceIds = [...new Set(
    events.filter(e => e.event_type === "voice" && e.reference_id).map(e => e.reference_id!)
  )];
  const textIds = [...new Set(
    events.filter(e => ["whatsapp_ai", "whatsapp_manual", "widget", "milink"].includes(e.event_type) && e.reference_id).map(e => e.reference_id!)
  )];

  const [voiceRes, textRes] = await Promise.all([
    voiceIds.length ? db.from("voice_agents").select("id, name").in("id", voiceIds) : { data: [] },
    textIds.length  ? db.from("text_agents").select("id, name").in("id", textIds)   : { data: [] }
  ]);

  const agentNames = new Map<string, string>();
  (voiceRes.data ?? []).forEach(a => agentNames.set(a.id, a.name));
  (textRes.data  ?? []).forEach(a => agentNames.set(a.id, a.name));

  // Agrupar por agente/canal para la tabla de Usage Details
  const detailsMap = new Map<string, { id: string; name: string; type: string; credits: number }>();
  events.forEach((ev, idx) => {
    const refId = ev.reference_id ?? "global";
    const key   = `${ev.event_type}-${refId}`;
    const agentName = ev.reference_id ? (agentNames.get(ev.reference_id) ?? null) : null;

    let name: string;
    let type: string;

    switch (ev.event_type) {
      case "voice":
        name = agentName ? `${agentName} — Agente de Voz` : "Agente de Voz";
        type = "Agente de Voz";
        break;
      case "whatsapp_ai":
        name = agentName ? `${agentName} — WhatsApp IA` : "WhatsApp con IA";
        type = "WhatsApp";
        break;
      case "whatsapp_manual":
        name = agentName ? `${agentName} — WhatsApp` : "WhatsApp Manual";
        type = "WhatsApp";
        break;
      case "widget":
        name = agentName ? `${agentName} — Widget Web` : "Widget Web";
        type = "ORI / Mi Link";
        break;
      case "milink":
        name = agentName ? `${agentName} — Mi Link` : "Mi Link";
        type = "ORI / Mi Link";
        break;
      case "ori":
        name = "ORI (copiloto)";
        type = "ORI / Mi Link";
        break;
      case "text_test":
        name = "Prueba de agentes";
        type = "ORI / Mi Link";
        break;
      case "form_fill":
        name = "ORI — Formularios";
        type = "Flujos";
        break;
      case "doc_scan":
        name = "ORI — Documentos";
        type = "Flujos";
        break;
      case "quote":
        name = "ORI — Cotizaciones";
        type = "Flujos";
        break;
      default:
        name = ev.event_type;
        type = "Otros";
    }

    const existing = detailsMap.get(key);
    if (existing) {
      existing.credits += ev.credits_charged;
    } else {
      detailsMap.set(key, { id: `${key}-${idx}`, name, type, credits: ev.credits_charged });
    }
  });

  const usageDetails = Array.from(detailsMap.values()).sort((a, b) => b.credits - a.credits);

  // ── Totales y estadísticas para las tarjetas del resumen ─────────────────
  let totalWeb = 0, totalWhatsapp = 0, totalVoz = 0, totalFlujos = 0, totalOtros = 0;
  dailyChart.forEach(d => {
    totalWeb      += d.web;
    totalWhatsapp += d.whatsapp;
    totalVoz      += d.voz;
    totalFlujos   += d.flujos;
    totalOtros    += d.otros;
  });

  let peakDay = 0, peakDayLabel = "—";
  dailyChart.forEach(d => {
    const dayTotal = d.web + d.whatsapp + d.voz + d.flujos + d.otros;
    if (dayTotal > peakDay) { peakDay = dayTotal; peakDayLabel = d.dayStr; }
  });

  const avgDaily = daysMap.size > 0 ? Math.round(used / daysMap.size) : 0;

  return NextResponse.json({
    organization: { id: orgId, name: ctx.organizationName },
    subscription:   subRes.data ?? null,
    wallet: wallet ? {
      period_start:      wallet.period_start,
      period_end:        wallet.period_end,
      included_credits:  included,
      topup_credits:     topup,
      used_credits:      used,
      total_credits:     total,
      remaining_credits: remaining,
      used_pct:          total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
    } : null,
    usage,
    invoices:      invoicesRes.data ?? [],
    plans,
    daily_chart:   dailyChart,
    usage_details: usageDetails,
    stats: {
      avg_daily:     avgDaily,
      peak_daily:    peakDay,
      peak_day_label: peakDayLabel,
      total_web:     totalWeb,
      total_whatsapp: totalWhatsapp,
      total_voz:     totalVoz,
      total_flujos:  totalFlujos,
      total_otros:   totalOtros
    }
  });
}
