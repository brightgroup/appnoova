"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard, RefreshCw, AlertTriangle, CheckCircle2, Zap,
  Receipt, Search, ExternalLink, HelpCircle, Eye, Download,
  Info, Phone, TrendingUp, Calendar, ArrowRight, Star
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnFilterGroup, btnFilterActive, btnFilterIdle, btnGhost, btnPrimary,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableEmpty, registryTableFooter, registrySearchRow,
  registryTableArea, inputSearch, btnIcon, accentBadge, textMuted
} from "@/lib/brand-ui";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { VOICE_CREDITS_PER_MINUTE } from "@/lib/billing/pricing";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Wallet {
  period_start: string; period_end: string;
  included_credits: number; topup_credits: number;
  used_credits: number; total_credits: number;
  remaining_credits: number; used_pct: number;
}
interface Subscription {
  plan_id: string; status: string; price_usd: number;
  monthly_credits: number; current_period_start: string;
  current_period_end: string; trial_ends_at: string | null;
  custom_label?: string;
  plans?: { name: string; price_usd: number; monthly_credits: number; whatsapp_included: boolean; support_level: string };
}
interface Invoice {
  id: string; plan_id?: string; period_start: string; period_end: string;
  due_date: string; amount_usd: number; amount_cop: number; status: string;
}
interface Plan {
  id: string; name: string; price_usd: number; monthly_credits: number;
  trial_days: number; whatsapp_included: boolean; max_text_agents: number | null;
  max_users: number | null; support_level: string;
}
interface DailyPoint {
  dayStr: string; dateKey: string;
  web: number; whatsapp: number; voz: number; flujos: number; otros: number;
}
interface UsageDetail { id: string; name: string; type: string; credits: number; }
interface Stats {
  avg_daily: number; peak_daily: number; peak_day_label: string;
  total_web: number; total_whatsapp: number; total_voz: number; total_flujos: number; total_otros: number;
}
interface BillingData {
  organization: { id: string; name: string };
  subscription: Subscription | null; wallet: Wallet | null;
  invoices: Invoice[]; plans: Plan[];
  daily_chart: DailyPoint[]; usage_details: UsageDetail[]; stats: Stats;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Resumen" },
  { id: "invoices", label: "Facturas" },
  { id: "plans",    label: "Planes" },
  { id: "usage",    label: "Uso detallado" },
  { id: "auto",     label: "Recarga automática" },
];

const CHART_KEYS = [
  { key: "web",      label: "ORI / Mi Link",  color: "#5b5bf6" },
  { key: "whatsapp", label: "WhatsApp",        color: "#22c55e" },
  { key: "voz",      label: "Agentes de Voz", color: "#c084fc" },
  { key: "flujos",   label: "Flujos / ORI",   color: "#06b6d4" },
  { key: "otros",    label: "Otros",           color: "#6b7280" },
] as const;

const INVOICE_FILTERS = [
  { id: "todos",   label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "paid",    label: "Pagadas" },
  { id: "overdue", label: "Vencidas" },
];
const USAGE_FILTERS = [
  { id: "todos",          label: "Todos" },
  { id: "Agente de Voz", label: "Agentes de Voz" },
  { id: "WhatsApp",       label: "WhatsApp" },
  { id: "ORI / Mi Link",  label: "ORI / Mi Link" },
  { id: "Flujos",         label: "Flujos" },
];

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-300" },
  paid:    { label: "Pagada",    cls: "bg-green-500/15 text-green-300" },
  overdue: { label: "Vencida",   cls: "bg-red-500/15 text-red-300" },
  void:    { label: "Anulada",   cls: "bg-gray-500/15 text-gray-400" },
};
const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  trialing:  { label: "En prueba",      cls: "bg-[#5b5bf6]/15 text-[#a5a5ff]" },
  active:    { label: "Activa",         cls: "bg-green-500/15 text-green-300" },
  past_due:  { label: "Pago pendiente", cls: "bg-amber-500/15 text-amber-300" },
  suspended: { label: "Suspendida",     cls: "bg-red-500/15 text-red-300" },
  canceled:  { label: "Cancelada",      cls: "bg-gray-500/15 text-gray-400" },
};

const PLAN_COPY: Record<string, { tagline: string; features: string[]; ideal: string }> = {
  explorador: {
    tagline: "Prueba Noova 14 días sin tarjeta",
    features: ["ORI, Mi Link e inbox", "1 agente de texto", "Soporte por email"],
    ideal: "Para explorar antes de comprometerte",
  },
  esencial: {
    tagline: "Equipo pequeño, volumen moderado",
    features: ["350.000 créditos/mes", "Hasta 5 usuarios", "CRM e inbox con ia", "WhatsApp incluido", "Soporte por email"],
    ideal: "Corredor independiente · 1–5 personas",
  },
  crecimiento: {
    tagline: "Más equipo y más volumen mensual",
    features: ["1.500.000 créditos/mes", "Hasta 15 usuarios", "Misma plataforma completa", "Soporte prioritario"],
    ideal: "Agencia en crecimiento · 6–15 personas",
  },
  escala: {
    tagline: "Alto volumen y equipo grande",
    features: ["3.800.000 créditos/mes", "Usuarios ilimitados", "Misma plataforma completa", "Soporte dedicado"],
    ideal: "Operación grande · más de 15 personas o alto consumo",
  },
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const fmtN = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const daysUntil = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null;

// ── Componente principal ──────────────────────────────────────────────────────

export default function FacturacionPage() {
  const [tab, setTab]         = useState("overview");
  const [data, setData]       = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Filtros locales
  const [invFilter,  setInvFilter]  = useState("todos");
  const [invSearch,  setInvSearch]  = useState("");
  const [uFilter,    setUFilter]    = useState("todos");
  const [uSearch,    setUSearch]    = useState("");

  // Auto-recarga (UI placeholder — sin pasarela aún)
  const [autoOn, setAutoOn] = useState(false);
  const [rechargeQ, setRechargeQ] = useState("50000");

  // Tooltip + filtro de fechas gráfico
  const [hoverBar,   setHoverBar]   = useState<DailyPoint | null>(null);
  const [chartFrom,  setChartFrom]  = useState("");
  const [chartTo,    setChartTo]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const res  = await authFetch("/api/billing/me");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Derivados del estado
  const wallet   = data?.wallet;
  const sub      = data?.subscription;
  const plans    = data?.plans ?? [];
  const stats    = data?.stats;
  const chart    = data?.daily_chart ?? [];
  const planName = sub?.plans?.name ?? sub?.plan_id ?? "—";
  const status   = sub?.status ?? "active";
  const sBadge   = SUB_STATUS[status] ?? SUB_STATUS.active;
  const remaining   = wallet?.remaining_credits ?? 0;
  const total       = wallet?.total_credits ?? 0;
  const usedPct     = wallet?.used_pct ?? 0;
  const usedCredits = wallet?.used_credits ?? 0;
  const daysLeft    = daysUntil(wallet?.period_end ?? null);
  const blocked     = status === "suspended" || status === "canceled";

  // Filtrado de facturas
  const filteredInv = useMemo(() => (data?.invoices ?? []).filter(inv => {
    const q = invSearch.toLowerCase();
    return (invFilter === "todos" || inv.status === invFilter) &&
      (q === "" || inv.id.toLowerCase().includes(q) || (inv.plan_id ?? "").toLowerCase().includes(q));
  }), [data?.invoices, invFilter, invSearch]);

  // Paginación facturas
  const invPag = useRegistryPagination(filteredInv.length, `${invFilter}-${invSearch}`);
  const invPage = invPag.pageRows(filteredInv);

  // Filtrado de uso detallado
  const filteredUsage = useMemo(() => (data?.usage_details ?? []).filter(u => {
    const q = uSearch.toLowerCase();
    return (uFilter === "todos" || u.type === uFilter) &&
      (q === "" || u.name.toLowerCase().includes(q));
  }), [data?.usage_details, uFilter, uSearch]);

  // Paginación uso
  const uPag = useRegistryPagination(filteredUsage.length, `${uFilter}-${uSearch}`);
  const uPage = uPag.pageRows(filteredUsage);

  const totalUsageCredits = filteredUsage.reduce((s, u) => s + u.credits, 0);

  // Filtrado de fechas del gráfico (client-side)
  const chartFiltered = useMemo(() => {
    if (!chartFrom && !chartTo) return chart;
    return chart.filter(p => {
      const d = p.dateKey;
      if (chartFrom && d < chartFrom) return false;
      if (chartTo   && d > chartTo)   return false;
      return true;
    });
  }, [chart, chartFrom, chartTo]);

  // Máximo barra gráfico
  const maxBar = Math.max(...chartFiltered.map(p => p.web + p.whatsapp + p.voz + p.flujos + p.otros), 500);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-noova-main text-white overflow-hidden">

      {/* Toolbar con pestañas */}
      <div className="shrink-0 bg-noova-main border-b border-white/[.08]">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Facturación</h1>
          </div>
          <button onClick={load} className={btnIcon} title="Actualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex gap-0 overflow-x-auto px-5 text-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 pb-3 pt-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === t.id
                  ? "text-white border-[#5b5bf6]"
                  : "text-gray-400 border-transparent hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido principal con scroll */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">

        {error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300 mb-5">{error}</div>
        )}
        {blocked && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 mb-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-200">Cuenta suspendida</p>
              <p className="text-sm text-red-300/80">Tu servicio está pausado. Contacta a tu asesor para reactivar.</p>
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-32 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-[#5b5bf6]" /> Cargando…
          </div>
        ) : !data ? null : (

          <>
            {/* ══════════════════════════════════════════════════════
                TAB 1 — RESUMEN
            ══════════════════════════════════════════════════════ */}
            {tab === "overview" && (
              <div className="space-y-5 max-w-5xl">

                {/* Grid de métricas — estilo dashboard Noova */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* Créditos disponibles */}
                  <div className="col-span-2 bg-gradient-to-br from-[#5b5bf6]/15 to-[#7070f8]/5 border border-[#5b5bf6]/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-[#a5a5ff]/80 font-semibold uppercase tracking-wider">Créditos disponibles</p>
                      <span title="1 crédito = $1 COP · saldo unificado para todos los servicios">
                        <HelpCircle className="w-3 h-3 text-[#5b5bf6]/50 cursor-help" />
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-2xl font-bold tracking-tight">{fmtN(remaining)}</p>
                      <p className="text-xs text-[#a5a5ff]/50">/ {fmtN(total)}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden mb-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[#a5a5ff]/40">{fmtN(usedCredits)} usados · {usedPct}%</p>
                  </div>

                  {/* Plan actual */}
                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-5 hover:bg-white/[.04] transition-colors">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Plan actual</p>
                    <p className="text-2xl font-bold capitalize">{planName}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${sBadge.cls}`}>{sBadge.label}</span>
                      {sub?.custom_label && (
                        <span className="text-[10px] text-[#a5a5ff] bg-[#5b5bf6]/10 px-1.5 py-0.5 rounded-md truncate max-w-[80px]" title={sub.custom_label}>
                          {sub.custom_label}
                        </span>
                      )}
                    </div>
                    {sub?.price_usd != null && (
                      <p className="text-sm text-gray-400 mt-2">
                        {sub.price_usd > 0 ? `$${sub.price_usd} USD/mes` : "Plan gratuito"}
                      </p>
                    )}
                  </div>

                  {/* Próxima renovación */}
                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-5 hover:bg-white/[.04] transition-colors">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Renovación
                    </p>
                    <p className="text-lg font-bold">{fmtDate(wallet?.period_end ?? null)}</p>
                    {daysLeft != null && (
                      <p className={`text-sm mt-1 ${daysLeft <= 5 ? "text-amber-400" : "text-gray-400"}`}>
                        en {daysLeft} día{daysLeft === 1 ? "" : "s"}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Inicio: {fmtDate(wallet?.period_start ?? null)}
                    </p>
                  </div>
                </div>

                {/* Gráfico de consumo diario — barras horizontales */}
                <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-5">

                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#5b5bf6] shrink-0" />
                      <div>
                        <h2 className="text-sm font-bold">Consumo del periodo</h2>
                        <p className="text-xs text-gray-500">{fmtDate(wallet?.period_start ?? null)} — {fmtDate(wallet?.period_end ?? null)}</p>
                      </div>
                    </div>

                    {/* Control de fechas */}
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="date"
                        value={chartFrom}
                        onChange={e => setChartFrom(e.target.value)}
                        className="h-7 rounded-lg border border-white/[.10] bg-white/[.04] px-2 text-[11px] text-gray-300 focus:outline-none focus:border-[#5b5bf6]/50 [color-scheme:dark]"
                      />
                      <span className="text-xs text-gray-600">—</span>
                      <input
                        type="date"
                        value={chartTo}
                        onChange={e => setChartTo(e.target.value)}
                        className="h-7 rounded-lg border border-white/[.10] bg-white/[.04] px-2 text-[11px] text-gray-300 focus:outline-none focus:border-[#5b5bf6]/50 [color-scheme:dark]"
                      />
                      {(chartFrom || chartTo) && (
                        <button
                          onClick={() => { setChartFrom(""); setChartTo(""); }}
                          className="h-7 px-2 text-[10px] text-gray-500 hover:text-white rounded-lg hover:bg-white/[.06] transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 mb-4">
                    {CHART_KEYS.map(c => (
                      <span key={c.key} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                        {c.label}
                      </span>
                    ))}
                  </div>

                  {/* Barras horizontales — fecha en eje vertical */}
                  {chartFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Sin datos para el rango seleccionado.</p>
                  ) : (
                    <div
                      className="space-y-1 max-h-72 overflow-y-auto pr-1"
                      onMouseLeave={() => setHoverBar(null)}
                    >
                      {chartFiltered.map(p => {
                        const dayTotal = p.web + p.whatsapp + p.voz + p.flujos + p.otros;
                        const pct      = maxBar > 0 ? (dayTotal / maxBar) * 100 : 0;
                        const isHover  = hoverBar?.dateKey === p.dateKey;
                        return (
                          <div
                            key={p.dateKey}
                            className={`flex items-center gap-2.5 group cursor-pointer rounded-lg px-1 py-0.5 transition-colors ${isHover ? "bg-white/[.04]" : "hover:bg-white/[.02]"}`}
                            onMouseEnter={() => setHoverBar(p)}
                          >
                            {/* Etiqueta de día */}
                            <span className="w-10 text-[9px] text-gray-500 tabular-nums text-right shrink-0">{p.dayStr}</span>

                            {/* Barra compuesta */}
                            <div className="flex-1 h-4 rounded overflow-hidden bg-white/[.04] relative">
                              {dayTotal > 0 && (
                                <div
                                  className="absolute left-0 top-0 h-full flex rounded overflow-hidden transition-all"
                                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                                >
                                  {CHART_KEYS.map(c => {
                                    const v = p[c.key as keyof DailyPoint] as number;
                                    return v > 0 ? (
                                      <div
                                        key={c.key}
                                        title={`${c.label}: ${fmtN(v)}`}
                                        style={{ width: `${(v / dayTotal) * 100}%`, backgroundColor: c.color }}
                                      />
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Valor total del día */}
                            <span className="w-16 text-[9px] text-right tabular-nums shrink-0 text-gray-500 group-hover:text-gray-300 transition-colors">
                              {dayTotal > 0 ? fmtN(dayTotal) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tooltip flotante al hacer hover */}
                  {hoverBar && (() => {
                    const dayTotal = CHART_KEYS.reduce((s, c) => s + (hoverBar[c.key as keyof DailyPoint] as number), 0);
                    return (
                      <div className="mt-3 border-t border-white/[.06] pt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px]">
                        <span className="text-gray-400 font-semibold w-full">{hoverBar.dayStr} · {fmtN(dayTotal)} cr totales</span>
                        {CHART_KEYS.map(c => {
                          const v = hoverBar[c.key as keyof DailyPoint] as number;
                          return v > 0 ? (
                            <span key={c.key} className="flex items-center gap-1.5 text-gray-400">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                              {c.label}: <span className="text-white font-semibold">{fmtN(v)}</span>
                            </span>
                          ) : null;
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Cards estadísticas — estilo dashboard */}
                {stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Promedio diario", value: fmtN(stats.avg_daily), sub: "créditos/día", color: "text-white" },
                      { label: "Día pico",        value: fmtN(stats.peak_daily), sub: stats.peak_day_label, color: "text-white" },
                      { label: "ORI / Mi Link",   value: fmtN(stats.total_web),      sub: "créditos", color: "text-[#a5a5ff]" },
                      { label: "WhatsApp",         value: fmtN(stats.total_whatsapp), sub: "créditos", color: "text-green-400" },
                      { label: "Agentes de Voz",  value: fmtN(stats.total_voz),      sub: "créditos", color: "text-purple-400" },
                    ].map(s => (
                      <div key={s.label} className="bg-white/[.02] border border-white/[.08] rounded-xl p-4 hover:bg-white/[.04] transition-colors">
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Banner prueba */}
                {sub?.status === "trialing" && sub.trial_ends_at && (
                  <div className="rounded-xl border border-[#5b5bf6]/25 bg-gradient-to-br from-[#5b5bf6]/12 to-[#7070f8]/5 p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">Estás en periodo de prueba</p>
                      <p className={`text-sm ${textMuted} mt-0.5`}>Termina el {fmtDate(sub.trial_ends_at)}. Activa un plan para continuar sin interrupciones.</p>
                    </div>
                    <button onClick={() => setTab("plans")} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-semibold transition-colors">
                      Ver planes <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 2 — FACTURAS (tabla estilo CRM/agentes)
            ══════════════════════════════════════════════════════ */}
            {tab === "invoices" && (
              <div className="flex flex-col gap-4 max-w-5xl">

                {/* Filtros */}
                <div className="overflow-x-auto -mx-1 px-1">
                  <div className={btnFilterGroup}>
                    {INVOICE_FILTERS.map(f => (
                      <button key={f.id} onClick={() => setInvFilter(f.id)} className={invFilter === f.id ? btnFilterActive : btnFilterIdle}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barra búsqueda */}
                <div className={registrySearchRow}>
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar factura..."
                      value={invSearch}
                      onChange={e => setInvSearch(e.target.value)}
                      className={inputSearch}
                    />
                  </div>
                  <button onClick={load} className={btnIcon} title="Actualizar">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                  <button className={btnGhost}>
                    <ExternalLink className="w-4 h-4" /> Historial completo
                  </button>
                </div>

                {/* Tabla */}
                <div className={registryTableArea}>
                  {filteredInv.length === 0 ? (
                    <div className={registryTableEmpty}>
                      {data.invoices.length === 0
                        ? "No hay facturas todavía. Las facturas aparecen al activar un plan de pago."
                        : "Sin resultados para este filtro."}
                    </div>
                  ) : (
                    <table className={registryTable}>
                      <thead className={registryTableHead}>
                        <tr className={registryTableHeadRow}>
                          <th className={registryTableHeadCell}>Periodo</th>
                          <th className={registryTableHeadCell}>Referencia</th>
                          <th className={registryTableHeadCell}>Plan</th>
                          <th className={registryTableHeadCell}>Vence</th>
                          <th className={registryTableHeadCell}>Estado</th>
                          <th className={registryTableHeadCell}>Monto</th>
                          <th className={registryTableHeadCell}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invPage.map(inv => {
                          const s = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.pending;
                          return (
                            <tr key={inv.id} className={registryTableRow}>
                              <td className={registryTableCellFirst}>
                                <p className="text-sm font-medium text-white">{fmtDate(inv.period_start)}</p>
                                <p className="text-xs text-gray-500">{fmtDate(inv.period_end)}</p>
                              </td>
                              <td className={registryTableCell}>
                                <span className="font-mono text-xs text-gray-300">{inv.id.substring(0, 8).toUpperCase()}</span>
                              </td>
                              <td className={`${registryTableCell} capitalize text-gray-300`}>{inv.plan_id ?? planName}</td>
                              <td className={`${registryTableCell} text-gray-400`}>{fmtDate(inv.due_date)}</td>
                              <td className={registryTableCell}>
                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>
                                  {inv.status === "paid" && <CheckCircle2 className="w-2.5 h-2.5" />}
                                  {s.label}
                                </span>
                              </td>
                              <td className={registryTableCell}>
                                <p className="text-sm font-bold text-white">${inv.amount_usd.toFixed(2)}</p>
                                <p className="text-[10px] text-gray-500">${fmtN(inv.amount_cop)} COP</p>
                              </td>
                              <td className={registryTableCell}>
                                <div className="flex items-center gap-1 text-gray-500">
                                  <button className="p-1.5 hover:bg-white/[.06] rounded-md hover:text-white" title="Ver detalle"><Eye className="w-3.5 h-3.5" /></button>
                                  <button className="p-1.5 hover:bg-white/[.06] rounded-md hover:text-white" title="Descargar"><Download className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Paginación */}
                {filteredInv.length > 0 && (
                  <div className={registryTableFooter}>
                    <RegistryTablePagination
                      {...invPag}
                      onPageChange={invPag.setPage}
                      onPageSizeChange={invPag.setPageSize}
                      label="facturas"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 3 — PLANES (cards Noova, datos reales de la BD)
            ══════════════════════════════════════════════════════ */}
            {tab === "plans" && (
              <div className="max-w-5xl space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {plans.map(p => {
                    const isActive  = p.id === sub?.plan_id;
                    const copy      = PLAN_COPY[p.id] ?? { tagline: "", features: [], ideal: "" };
                    const callsEst  = p.monthly_credits > 0 ? Math.floor(p.monthly_credits / VOICE_CREDITS_PER_MINUTE) : 0;

                    return (
                      <div
                        key={p.id}
                        className={`relative rounded-xl border flex flex-col transition-all ${
                          isActive
                            ? "border-[#5b5bf6]/50 bg-gradient-to-b from-[#5b5bf6]/10 to-transparent shadow-lg shadow-[#5b5bf6]/10"
                            : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04] hover:border-white/[.14]"
                        }`}
                      >
                        {/* Badges */}
                        {p.id === "crecimiento" && !isActive && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#5b5bf6] text-white">
                            Más popular
                          </span>
                        )}
                        {isActive && (
                          <span className="absolute -top-2.5 left-4 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-600 text-white flex items-center gap-1">
                            <Star className="w-2 h-2" /> Plan actual
                          </span>
                        )}

                        <div className="p-5 flex-1 space-y-4">
                          {/* Nombre + precio */}
                          <div>
                            <h3 className="text-sm font-bold text-white">{p.name}</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{copy.tagline}</p>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs text-gray-400">US$</span>
                            <span className="text-3xl font-extrabold text-white">{fmtN(p.price_usd)}</span>
                            <span className="text-xs text-gray-500">/mes</span>
                          </div>

                          {/* Barra de créditos si es el plan activo */}
                          {isActive && (
                            <div className="py-3 border-y border-white/[.06] space-y-2">
                              <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                                  <span>Créditos usados</span>
                                  <span>{fmtN(wallet?.used_credits ?? 0)} / {fmtN(total)}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden">
                                  <div className="h-full bg-[#5b5bf6] rounded-full" style={{ width: `${usedPct}%` }} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Créditos del plan */}
                          <p className="text-xs font-semibold text-[#a5a5ff]">
                            {fmtN(p.monthly_credits)} créditos/mes
                            {p.max_users != null && (
                              <span className="text-gray-400 font-normal ml-1">· hasta {p.max_users} usuarios</span>
                            )}
                            {p.max_users == null && p.price_usd > 0 && (
                              <span className="text-gray-400 font-normal ml-1">· usuarios ilimitados</span>
                            )}
                            {p.trial_days > 0 && <span className="text-gray-500 font-normal ml-1">· {p.trial_days} días gratis</span>}
                          </p>

                          {/* Features */}
                          <ul className="space-y-1.5 text-xs">
                            {copy.features.map(f => (
                              <li key={f} className="flex items-start gap-2">
                                <CheckCircle2 className="w-3 h-3 text-[#5b5bf6] shrink-0 mt-0.5" />
                                <span className="text-gray-300">{f}</span>
                              </li>
                            ))}
                          </ul>

                          {/* Ideal para */}
                          <p className="text-[10px] text-gray-500 italic">{copy.ideal}</p>
                        </div>

                        {/* Pie de tarjeta */}
                        {callsEst > 0 && (
                          <div className="px-5 pb-5">
                            <div className="rounded-lg border border-white/[.06] bg-white/[.03] p-3 text-center">
                              <p className="text-[9px] text-gray-500 font-semibold uppercase tracking-wide flex items-center justify-center gap-1 mb-1">
                                <Phone className="w-2.5 h-2.5" /> Aprox. en llamadas de voz
                              </p>
                              <p className="text-sm font-bold text-white">{fmtN(callsEst)} min/mes</p>
                              <p className="text-[9px] text-gray-600">a {VOICE_CREDITS_PER_MINUTE} créditos / minuto</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Nota informativa */}
                <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 flex items-start gap-3 text-sm text-gray-400">
                  <Info className="w-4 h-4 text-[#5b5bf6] shrink-0 mt-0.5" />
                  <p>
                    Los planes se activan manualmente por tu asesor.
                    Escríbenos a{" "}
                    <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">info@bgsoluciones.com.co</a>
                    {" "}para cambiar de plan, solicitar descuentos o resolver dudas.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 4 — USO DETALLADO (tabla estilo CRM/agentes)
            ══════════════════════════════════════════════════════ */}
            {tab === "usage" && (
              <div className="flex flex-col gap-4 max-w-5xl">

                {/* Filtros por tipo */}
                <div className="overflow-x-auto -mx-1 px-1">
                  <div className={btnFilterGroup}>
                    {USAGE_FILTERS.map(f => (
                      <button key={f.id} onClick={() => setUFilter(f.id)} className={uFilter === f.id ? btnFilterActive : btnFilterIdle}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barra búsqueda */}
                <div className={registrySearchRow}>
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por agente o canal..."
                      value={uSearch}
                      onChange={e => setUSearch(e.target.value)}
                      className={inputSearch}
                    />
                  </div>
                  <button onClick={load} className={btnIcon} title="Actualizar">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                  <span className="text-xs text-gray-400 bg-white/[.04] px-3 py-2 rounded-lg border border-white/[.06]">
                    {fmtDate(wallet?.period_start ?? null)} — {fmtDate(wallet?.period_end ?? null)}
                  </span>
                </div>

                {/* Tabla */}
                <div className={registryTableArea}>
                  {filteredUsage.length === 0 ? (
                    <div className={registryTableEmpty}>
                      {data.usage_details.length === 0
                        ? "Sin consumo en este periodo todavía."
                        : "Sin resultados para este filtro."}
                    </div>
                  ) : (
                    <table className={registryTable}>
                      <thead className={registryTableHead}>
                        <tr className={registryTableHeadRow}>
                          <th className={registryTableHeadCell}>Nombre / Canal</th>
                          <th className={registryTableHeadCell}>Tipo</th>
                          <th className={`${registryTableHeadCell} text-right`}>Créditos</th>
                          <th className={registryTableHeadCell}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {uPage.map(u => {
                          const typeCls =
                                u.type === "Agente de Voz" ? "bg-purple-500/15 text-purple-300" :
                            u.type === "WhatsApp"      ? "bg-green-500/15 text-green-300" :
                            u.type === "ORI / Mi Link" ? "bg-[#5b5bf6]/15 text-[#a5a5ff]" :
                            u.type === "Flujos"        ? "bg-cyan-500/15 text-cyan-300" :
                                                         "bg-white/[.06] text-gray-400";
                          return (
                            <tr key={u.id} className={registryTableRow}>
                              <td className={registryTableCellFirst}>
                                <p className="text-sm font-medium text-white">{u.name}</p>
                              </td>
                              <td className={registryTableCell}>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${typeCls}`}>{u.type}</span>
                              </td>
                              <td className={`${registryTableCell} text-right font-bold text-white tabular-nums`}>
                                {fmtN(u.credits)}
                              </td>
                              <td className={registryTableCell}>
                                <button className="p-1.5 text-gray-600 hover:text-white hover:bg-white/[.06] rounded-md">
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Paginación + total */}
                <div className={registryTableFooter}>
                  <RegistryTablePagination
                    {...uPag}
                    onPageChange={uPag.setPage}
                    onPageSizeChange={uPag.setPageSize}
                    label="entradas"
                  />
                  <div className="flex items-center gap-2 text-sm font-bold text-white ml-auto">
                    <Receipt className="w-4 h-4 text-[#5b5bf6]" />
                    Total: <span className={accentBadge}>{fmtN(totalUsageCredits)} cr</span>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 5 — RECARGA AUTOMÁTICA (inspirado en dashboard/landing Noova)
            ══════════════════════════════════════════════════════ */}
            {tab === "auto" && (
              <div className="max-w-2xl space-y-5">

                {/* Banner "próximamente" */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-4 flex items-start gap-3 text-sm text-amber-200">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    Esta funcionalidad estará disponible al integrar la pasarela de pago.
                    Por ahora, las recargas se coordinan con tu asesor en{" "}
                    <a href="mailto:info@bgsoluciones.com.co" className="text-amber-300 hover:underline font-semibold">
                      info@bgsoluciones.com.co
                    </a>.
                  </p>
                </div>

                {/* Tarjeta principal — estilo Pro Tip del dashboard */}
                <div className="rounded-xl bg-gradient-to-br from-[#5b5bf6]/20 to-[#7070f8]/5 border border-[#5b5bf6]/25 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#5b5bf6]/20 border border-[#5b5bf6]/30">
                        <Zap className="w-5 h-5 text-[#a5a5ff]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Recarga automática</h3>
                        <p className="text-xs text-[#a5a5ff]/70 mt-0.5">Sin interrupciones en tu operación</p>
                      </div>
                    </div>
                    {/* Toggle visual (deshabilitado hasta integrar pasarela) */}
                    <div
                      className={`relative w-11 h-6 rounded-full border cursor-not-allowed transition-colors ${
                        autoOn ? "bg-[#5b5bf6] border-[#5b5bf6]" : "bg-white/[.06] border-white/[.12]"
                      }`}
                      title="Disponible próximamente"
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoOn ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </div>
                  <p className="text-sm text-[#a5a5ff]/80 leading-relaxed">
                    Configura un umbral mínimo de créditos. Cuando tu saldo baje de ese nivel, se añaden créditos automáticamente
                    para que tus agentes nunca se detengan.
                  </p>
                </div>

                {/* Flujo de 3 pasos — minimalista, sin iconos emoji */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { step: 1, title: "Umbral mínimo",   desc: "Cuando el saldo baja del nivel configurado" },
                    { step: 2, title: "Recarga inmediata", desc: "Se añaden créditos automáticamente" },
                    { step: 3, title: "Tope mensual",     desc: "Sin superar el presupuesto definido" },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                      <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[#5b5bf6]/15 text-[#a5a5ff] text-[10px] font-bold mb-3">{step}</span>
                      <p className="text-xs font-semibold text-white mb-1">{title}</p>
                      <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>

                {/* Configuración (deshabilitada visualmente) */}
                <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5 space-y-4 opacity-50 pointer-events-none">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Configuración (próximamente)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Paquete de recarga</label>
                      <select
                        value={rechargeQ}
                        onChange={e => setRechargeQ(e.target.value)}
                        className="w-full rounded-lg border border-white/[.12] bg-noova-main px-3 py-2 text-sm text-white"
                      >
                        <option value="15000">15.000 créditos</option>
                        <option value="50000">50.000 créditos</option>
                        <option value="100000">100.000 créditos</option>
                        <option value="350000">350.000 créditos</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Umbral mínimo (créditos)</label>
                      <input
                        type="number"
                        defaultValue={5000}
                        className="w-full rounded-lg border border-white/[.12] bg-noova-main px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                  <button className={`${btnPrimary} w-full justify-center`} disabled>
                    Guardar configuración
                  </button>
                </div>

              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
