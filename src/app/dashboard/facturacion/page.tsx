"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard, RefreshCw, AlertTriangle, CheckCircle2, Zap,
  Receipt, Search, ExternalLink, HelpCircle, Eye, Download,
  Info, Phone, TrendingUp, Calendar, ArrowRight, Star
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnFilterGroup, btnFilterActive, btnFilterIdle, btnGhost, btnPrimary, promoCard,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableEmpty, registryTableFooter, registrySearchRow,
  registryTableArea, inputSearch, btnIcon, textMuted
} from "@/lib/brand-ui";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { InfoBox } from "@/components/ui/InfoBox";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { usePricingCatalog } from "@/hooks/usePricingCatalog";
import { PaddleCheckoutButton, usePaddleCheckout } from "@/components/billing/PaddleCheckoutButton";
import { openInvoicePdf } from "@/lib/billing/open-invoice-pdf";
import { CardBrandIcon } from "@/components/billing/CardBrandIcon";
import type { PlanPromoDisplay } from "@/lib/billing/plan-promo";
import {
  BILLING_CHART_CATEGORIES,
  chartAxisTicks,
  dayTotal,
  niceChartScaleMax,
  type BillingChartDay,
} from "@/lib/billing/chart-categories";

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
  billing_provider?: string;
  paddle_cancel_scheduled_at?: string | null;
  plans?: { name: string; price_usd: number; monthly_credits: number; whatsapp_included: boolean; support_level: string };
}
interface Invoice {
  id: string; plan_id?: string; period_start: string; period_end: string;
  due_date: string; amount_usd: number; amount_cop: number; status: string;
  paddle_transaction_id?: string | null;
}
interface Plan {
  id: string; name: string; price_usd: number; monthly_credits: number;
  trial_days: number; whatsapp_included: boolean; max_text_agents: number | null;
  max_users: number | null; support_level: string;
  is_public?: boolean;
}
type DailyPoint = BillingChartDay;
interface UsageDetail { id: string; name: string; type: string; credits: number; date: string; }
interface Stats {
  avg_daily: number; peak_daily: number; peak_day_label: string;
  category_totals: Record<string, number>;
}
interface BillingData {
  organization: { id: string; name: string };
  subscription: Subscription | null;
  plan_monthly_credits?: number;
  plan_promo?: PlanPromoDisplay | null;
  wallet: Wallet | null;
  invoices: Invoice[]; plans: Plan[];
  daily_chart: DailyPoint[]; usage_details: UsageDetail[]; stats: Stats;
  credit_packages?: { id: string; credits: number; price_usd: number }[];
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Resumen" },
  { id: "invoices", label: "Facturas" },
  { id: "plans",    label: "Planes" },
  { id: "usage",    label: "Uso detallado" },
  { id: "auto",     label: "Recarga automática" },
];

const CHART_RANGE_OPTIONS = [
  { id: "7",  label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "90", label: "90 días" },
] as const;

type ChartRangeId = (typeof CHART_RANGE_OPTIONS)[number]["id"];

const INVOICE_FILTERS = [
  { id: "todos",   label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "paid",    label: "Pagadas" },
  { id: "overdue", label: "Vencidas" },
];
const USAGE_FILTERS = [
  { id: "todos",           label: "Todos" },
  { id: "ORI",             label: "ORI" },
  { id: "Mi Link",         label: "Mi Link" },
  { id: "WhatsApp",        label: "WhatsApp" },
  { id: "Agentes de Voz",  label: "Agentes de Voz" },
  { id: "Documentos",      label: "Documentos" },
  { id: "Formularios",     label: "Formularios" },
  { id: "Cotizaciones",    label: "Cotizaciones" },
];

const INVOICE_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pendiente", variant: "amber" },
  paid:    { label: "Pagada",    variant: "emerald" },
  overdue: { label: "Vencida",   variant: "danger" },
  void:    { label: "Anulada",   variant: "neutral" },
};
const SUB_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  trialing:  { label: "En prueba",      variant: "accent" },
  active:    { label: "Activa",         variant: "emerald" },
  past_due:  { label: "Pago pendiente", variant: "amber" },
  suspended: { label: "Suspendida",     variant: "danger" },
  canceled:  { label: "Cancelada",      variant: "neutral" },
};

const PLAN_COPY: Record<string, { tagline: string; features: string[]; ideal: string }> = {
  explorador: {
    tagline: "Prueba Noova 14 días sin tarjeta",
    features: ["ORI, Mi Link e inbox", "1 agente de texto", "Soporte por email"],
    ideal: "Para explorar antes de comprometerte",
  },
  basico: {
    tagline: "Plan individual · todas las funciones",
    features: [
      "166.667 créditos/mes",
      "1 usuario",
      "WhatsApp, widget, Mi Link, ORI, CRM y voz",
      "Asignado por tu asesor Noova",
    ],
    ideal: "Operación individual con volumen moderado",
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
  paddle_qa: {
    tagline: "Solo superadmin · no aparece a clientes",
    features: [
      "Cobro real de USD 1 para probar Paddle Live",
      "No está en la landing ni en el catálogo público",
      "Si pagas, este org pasa a este plan (luego reasigna Crecimiento en /admin)",
    ],
    ideal: "Prueba interna de checkout",
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
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<{ brand: string | null; last4: string | null } | null>(null);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [buyPackageId, setBuyPackageId] = useState<string | null>(null);
  const { openCheckout: openCreditsCheckout, loading: buyingCredits, error: buyCreditsError } = usePaddleCheckout();
  const { openCheckout: openPlanCheckout, loading: payingPlan } = usePaddleCheckout();
  const [data, setData]       = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [invoicePdfMsg, setInvoicePdfMsg] = useState("");

  // Filtros locales
  const [invFilter,  setInvFilter]  = useState("todos");
  const [invSearch,  setInvSearch]  = useState("");
  const [uFilter,    setUFilter]    = useState("todos");
  const [uSearch,    setUSearch]    = useState("");

  // Auto-recarga
  interface AutoRechargeSettings {
    enabled: boolean; admin_enabled: boolean;
    threshold_credits: number; package_credits: number; monthly_cap_usd: number;
    last_recharge_at: string | null;
  }
  interface CreditPackage { id: string; credits: number; price_usd: number; }
  const [autoData, setAutoData] = useState<{ settings: AutoRechargeSettings | null; packages: CreditPackage[]; available: boolean } | null>(null);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const [autoForm, setAutoForm] = useState({ package_credits: 50000, threshold_credits: 5000, monthly_cap_usd: 100 });
  // Tarifa real 1 crédito = USD 0.0003; derivada del primer paquete cargado para no
  // hardcodearla dos veces, con ese valor como respaldo si aún no hay datos.
  const creditUsdRate = autoData?.packages?.[0]?.credits
    ? autoData.packages[0].price_usd / autoData.packages[0].credits
    : 0.0003;

  const [hoverBar, setHoverBar] = useState<DailyPoint | null>(null);
  const [chartRange, setChartRange] = useState<ChartRangeId>("30");
  const { catalog: pricingCatalog } = usePricingCatalog();
  const voiceCreditsPerMin = pricingCatalog?.voice_standard_per_min ?? 870;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const res  = await authFetch("/api/billing/me");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCancelPlan() {
    setCancelBusy(true); setCancelMsg("");
    const res = await authFetch("/api/billing/paddle/subscription/cancel", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { setShowCancelConfirm(false); await load(); }
    else setCancelMsg(json.error ?? "No se pudo cancelar");
    setCancelBusy(false);
  }

  async function handleResumePlan() {
    setCancelBusy(true); setCancelMsg("");
    const res = await authFetch("/api/billing/paddle/subscription/resume", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) await load();
    else setCancelMsg(json.error ?? "No se pudo deshacer la cancelación");
    setCancelBusy(false);
  }

  const loadAutorecharge = useCallback(async () => {
    setAutoLoading(true);
    const res = await authFetch("/api/billing/autorecharge");
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setAutoData(json);
      if (json.settings) {
        setAutoForm({
          package_credits: json.settings.package_credits,
          threshold_credits: json.settings.threshold_credits,
          monthly_cap_usd: json.settings.monthly_cap_usd,
        });
      }
    }
    setAutoLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "auto" && autoData === null) void loadAutorecharge();
  }, [tab, autoData, loadAutorecharge]);

  async function handleSaveAutorecharge(nextEnabled: boolean) {
    setAutoSaving(true); setAutoMsg("");
    const res = await authFetch("/api/billing/autorecharge", {
      method: "PUT",
      body: JSON.stringify({ enabled: nextEnabled, ...autoForm }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) await loadAutorecharge();
    else setAutoMsg(json.error ?? "No se pudo guardar");
    setAutoSaving(false);
  }

  async function handleOpenPortal() {
    setPortalBusy(true);
    const res = await authFetch("/api/billing/paddle/portal", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.url) window.location.href = json.url;
    else alert(json.error ?? "No se pudo abrir el portal de pagos");
    setPortalBusy(false);
  }

  useEffect(() => {
    if (data?.subscription?.billing_provider !== "paddle") { setPaymentMethod(null); return; }
    let cancelled = false;
    authFetch("/api/billing/payment-method")
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setPaymentMethod(json.payment_method ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data?.subscription?.billing_provider]);

  // Derivados del estado
  const wallet   = data?.wallet;
  const sub      = data?.subscription;
  const plans    = data?.plans ?? [];
  const chart    = data?.daily_chart ?? [];
  const planName = sub?.plans?.name ?? sub?.plan_id ?? "—";
  const catalogPlan = plans.find((p) => p.id === sub?.plan_id);
  const catalogPriceUsd = catalogPlan?.price_usd ?? sub?.plans?.price_usd ?? 0;
  const planPromo = data?.plan_promo ?? null;
  const effectivePriceUsd = planPromo?.price_usd ?? Number(sub?.price_usd ?? catalogPriceUsd);
  const planMonthlyCredits =
    data?.plan_monthly_credits ?? catalogPlan?.monthly_credits ?? sub?.monthly_credits ?? 0;
  const status   = sub?.status ?? "active";
  const sBadge   = SUB_STATUS[status] ?? SUB_STATUS.active;
  const remaining   = wallet?.remaining_credits ?? 0;
  const total       = wallet?.total_credits ?? 0;
  const usedPct     = wallet?.used_pct ?? 0;
  const usedCredits = wallet?.used_credits ?? 0;
  const daysLeft    = daysUntil(wallet?.period_end ?? null);
  const blocked     = status === "suspended" || status === "canceled";

  // Próxima factura por pagar (pending/overdue) — distinta de current_period_end:
  // el periodo de la suscripción puede extenderse más adelante que el plazo real
  // de pago de una factura ya emitida, así que hay que mostrar ambas fechas.
  const nextDueInvoice = useMemo(() => {
    return (data?.invoices ?? [])
      .filter((inv) => inv.status === "pending" || inv.status === "overdue")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  }, [data?.invoices]);
  const dueDaysLeft = daysUntil(nextDueInvoice?.due_date ?? null);

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

  const chartFiltered = useMemo(() => {
    const days = Number(chartRange);
    return chart.slice(-days);
  }, [chart, chartRange]);

  const chartRangeLabel = useMemo(() => {
    if (chartFiltered.length === 0) return "—";
    const first = chartFiltered[0];
    const last = chartFiltered[chartFiltered.length - 1];
    return `${first.dayLabel} — ${last.dayLabel}`;
  }, [chartFiltered]);

  const chartScaleMax = useMemo(() => {
    const maxDay = Math.max(...chartFiltered.map(dayTotal), 0);
    const dailyBudget = planMonthlyCredits > 0 ? planMonthlyCredits / 30 : 0;
    return niceChartScaleMax(Math.max(maxDay, dailyBudget * 0.25, 1_000));
  }, [chartFiltered, planMonthlyCredits]);

  const chartTicks = useMemo(() => chartAxisTicks(chartScaleMax, 4), [chartScaleMax]);

  const activeChartCategories = useMemo(
    () => BILLING_CHART_CATEGORIES.filter((c) =>
      chartFiltered.some((d) => d[c.key] > 0)
    ),
    [chartFiltered]
  );

  const rangeStats = useMemo(() => {
    let peak = 0;
    let peakLabel = "—";
    let sum = 0;
    chartFiltered.forEach((d) => {
      const t = dayTotal(d);
      sum += t;
      if (t > peak) {
        peak = t;
        peakLabel = d.dayStr;
      }
    });
    return {
      avg: chartFiltered.length > 0 ? Math.round(sum / chartFiltered.length) : 0,
      peak,
      peakLabel,
      total: sum,
    };
  }, [chartFiltered]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-noova-main overflow-hidden">

      {/* Toolbar con pestañas */}
      <div className="shrink-0 bg-noova-main border-b border-white/[.08]">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#0f7eff]" />
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
                  ? "text-white border-[#0f7eff]"
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
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-[#0f7eff]" /> Cargando…
          </div>
        ) : !data ? null : (

          <>
            {/* ══════════════════════════════════════════════════════
                TAB 1 — RESUMEN
            ══════════════════════════════════════════════════════ */}
            {tab === "overview" && (
              <div className="space-y-5 max-w-5xl">

                {planPromo && (
                  <div className="rounded-xl border border-[#0f7eff]/30 bg-gradient-to-r from-[#0f7eff]/15 to-[#3392ff]/5 p-4 flex items-start gap-3">
                    <Zap className="w-5 h-5 text-[#99c9ff] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#99c9ff]">Beneficio activo en tu plan</p>
                      <p className="text-sm text-gray-300 mt-1">{planPromo.headline}</p>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        {planPromo.price_discount_pct != null && planPromo.price_discount_pct > 0 && (
                          <span className="text-xs font-medium bg-green-500/15 text-green-300 px-2.5 py-1 rounded-full">
                            −{planPromo.price_discount_pct}% · US$ {fmtN(planPromo.price_usd)}/mes
                            <span className="line-through text-green-300/45 ml-1.5">${fmtN(planPromo.price_usd_catalog)}</span>
                          </span>
                        )}
                        {planPromo.credits_bonus_pct != null && planPromo.credits_bonus_pct > 0 && (
                          <span className="text-xs font-medium bg-[#072b55]/60 text-[#2f8fff] px-2.5 py-1 rounded-full">
                            +{planPromo.credits_bonus_pct}% créditos · {fmtN(planPromo.monthly_credits)}/mes
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {nextDueInvoice && (
                  <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                    nextDueInvoice.status === "overdue"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}>
                    <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${nextDueInvoice.status === "overdue" ? "text-red-400" : "text-amber-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${nextDueInvoice.status === "overdue" ? "text-red-300" : "text-amber-300"}`}>
                        {nextDueInvoice.status === "overdue" ? "Factura vencida" : "Factura pendiente de pago"}
                      </p>
                      <p className="text-sm text-gray-300 mt-1">
                        Vence el {fmtDate(nextDueInvoice.due_date)}
                        {dueDaysLeft != null && (
                          <span className="ml-1.5">
                            ({dueDaysLeft > 0 ? `en ${dueDaysLeft} día${dueDaysLeft === 1 ? "" : "s"}` : dueDaysLeft === 0 ? "hoy" : `hace ${Math.abs(dueDaysLeft)} día${Math.abs(dueDaysLeft) === 1 ? "" : "s"}`})
                          </span>
                        )}
                        {" · "}US$ {fmtN(nextDueInvoice.amount_usd)}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {sub?.billing_provider !== "paddle" && sub?.plan_id && (
                        <button
                          onClick={() => openPlanCheckout(
                            "/api/billing/paddle/checkout",
                            { plan_id: sub.plan_id },
                            () => void load()
                          )}
                          disabled={payingPlan}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--nv-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {payingPlan ? "Abriendo…" : "Pagar ahora"}
                        </button>
                      )}
                      <button
                        onClick={() => setTab("invoices")}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 transition-colors"
                      >
                        Ver factura
                      </button>
                    </div>
                  </div>
                )}

                {/* Grid de métricas — estilo dashboard Noova */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* Créditos disponibles */}
                  <div className={`${promoCard} col-span-2`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-[var(--nv-text-muted)] font-semibold uppercase tracking-wider">Créditos disponibles</p>
                      <span title="1 crédito equivale a un valor fijo en USD · el saldo es unificado para todos los servicios">
                        <HelpCircle className="w-3 h-3 text-[var(--nv-text-faint)] cursor-help" />
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-2xl font-bold tracking-tight text-[var(--nv-text)]">{fmtN(remaining)}</p>
                      <p className="text-xs text-[var(--nv-text-muted)]">/ {fmtN(total)}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--nv-bg-control)] overflow-hidden mb-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-[var(--nv-hubspot-teal)]" : "bg-[var(--nv-accent)]"}`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--nv-text-muted)]">{fmtN(usedCredits)} usados · {usedPct}%</p>
                  </div>

                  {/* Plan actual */}
                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-5 hover:bg-white/[.04] transition-colors">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Plan actual</p>
                    <p className="text-2xl font-bold capitalize">{planName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                      {planPromo?.label && (
                        <span className="text-[10px] text-[#2f8fff] bg-[#072b55]/60 px-2 py-0.5 rounded-md font-medium">
                          {planPromo.label}
                        </span>
                      )}
                    </div>
                    {sub && (
                      <div className="mt-2">
                        {sub.plan_id === "explorador" ? (
                          <p className="text-sm text-gray-400">
                            {sub.status === "trialing" ? "Prueba gratuita · 14 días" : "Plan gratuito"}
                          </p>
                        ) : planPromo?.price_discount_pct ? (
                          <>
                            <p className="text-xs text-gray-500 line-through">${fmtN(planPromo.price_usd_catalog)} USD/mes</p>
                            <p className="text-sm font-semibold text-green-300">${fmtN(effectivePriceUsd)} USD/mes</p>
                          </>
                        ) : effectivePriceUsd > 0 ? (
                          <p className="text-sm text-gray-400">${fmtN(effectivePriceUsd)} USD/mes</p>
                        ) : null}
                        {planPromo?.credits_bonus_pct != null && planPromo.credits_bonus_pct > 0 && (
                          <p className="text-[11px] text-[#99c9ff]/80 mt-1">
                            {fmtN(planPromo.monthly_credits)} cr/mes
                            <span className="text-gray-500 line-through ml-1">{fmtN(planPromo.monthly_credits_catalog)}</span>
                          </p>
                        )}
                      </div>
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

                {/* Gráfico de consumo diario */}
                <div className="bg-white/[.02] border border-white/[.08] rounded-2xl p-6">

                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-[#0f7eff]/15 border border-[#0f7eff]/25">
                        <TrendingUp className="w-5 h-5 text-[#99c9ff]" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold">Consumo del periodo</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{chartRangeLabel}</p>
                      </div>
                    </div>

                    <div className={btnFilterGroup}>
                      {CHART_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setChartRange(opt.id)}
                          className={chartRange === opt.id ? btnFilterActive : btnFilterIdle}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeChartCategories.length > 0 && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400 mb-5">
                      {activeChartCategories.map((c) => (
                        <span key={c.key} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {chartFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-12">Sin datos para el rango seleccionado.</p>
                  ) : (
                    <div onMouseLeave={() => setHoverBar(null)}>
                      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {[...chartFiltered].reverse().map((p) => {
                          const totalDay = dayTotal(p);
                          const pct = chartScaleMax > 0 ? (totalDay / chartScaleMax) * 100 : 0;
                          const isHover = hoverBar?.dateKey === p.dateKey;
                          const visibleCats = BILLING_CHART_CATEGORIES.filter((c) => p[c.key] > 0);

                          return (
                            <div
                              key={p.dateKey}
                              className={`grid grid-cols-[88px_1fr_72px] items-center gap-4 rounded-xl px-2 py-2 transition-colors cursor-pointer ${
                                isHover ? "bg-white/[.05]" : "hover:bg-white/[.03]"
                              }`}
                              onMouseEnter={() => setHoverBar(p)}
                            >
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-white tabular-nums">{p.dayStr}</p>
                                <p className="text-[11px] text-gray-500 capitalize truncate">{p.dayLabel.split(",")[0]}</p>
                              </div>

                              <div className="relative h-7 rounded-lg overflow-hidden bg-white/[.04]">
                                {totalDay > 0 && (
                                  <div
                                    className="absolute left-0 top-0 h-full flex rounded-lg overflow-hidden transition-all duration-300"
                                    style={{ width: `${Math.max(pct, totalDay > 0 ? 2 : 0)}%` }}
                                  >
                                    {visibleCats.map((c) => (
                                      <div
                                        key={c.key}
                                        title={`${c.label}: ${fmtN(p[c.key])}`}
                                        style={{
                                          width: `${(p[c.key] / totalDay) * 100}%`,
                                          backgroundColor: c.color,
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>

                              <span className="text-sm font-bold tabular-nums text-right shrink-0 text-gray-300">
                                {totalDay > 0 ? fmtN(totalDay) : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Eje X con valores de créditos */}
                      <div className="grid grid-cols-[88px_1fr_72px] gap-4 mt-4 pt-4 border-t border-white/[.06]">
                        <div />
                        <div className="relative h-6">
                          {chartTicks.map((tick) => (
                            <div
                              key={tick}
                              className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                              style={{ left: `${chartScaleMax > 0 ? (tick / chartScaleMax) * 100 : 0}%` }}
                            >
                              <span className="w-px h-2 bg-white/20" />
                              <span className="text-[11px] text-gray-500 tabular-nums mt-1">{fmtN(tick)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-600 text-right uppercase tracking-wide">créditos</p>
                      </div>
                    </div>
                  )}

                  {hoverBar && (() => {
                    const totalDay = dayTotal(hoverBar);
                    const visible = BILLING_CHART_CATEGORIES.filter((c) => hoverBar[c.key] > 0);
                    return (
                      <div className="mt-5 border-t border-white/[.06] pt-4 flex flex-wrap gap-x-6 gap-y-2">
                        <span className="text-sm text-gray-300 font-semibold w-full">
                          {hoverBar.dayLabel} · {fmtN(totalDay)} cr totales
                        </span>
                        {visible.map((c) => (
                          <span key={c.key} className="flex items-center gap-2 text-sm text-gray-400">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                            {c.label}: <span className="text-white font-semibold tabular-nums">{fmtN(hoverBar[c.key])}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Cards estadísticas del rango */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: "Promedio diario", value: fmtN(rangeStats.avg), sub: `últimos ${chartRange} días`, color: "text-white" },
                    { label: "Día pico", value: fmtN(rangeStats.peak), sub: rangeStats.peakLabel, color: "text-white" },
                    { label: "Total periodo", value: fmtN(rangeStats.total), sub: "créditos", color: "text-[#99c9ff]" },
                    ...BILLING_CHART_CATEGORIES.filter((c) => rangeStats.total > 0 && chartFiltered.some((d) => d[c.key] > 0))
                      .slice(0, 2)
                      .map((c) => ({
                        label: c.label,
                        value: fmtN(chartFiltered.reduce((s, d) => s + d[c.key], 0)),
                        sub: "créditos",
                        color: c.key === "whatsapp" ? "text-green-400" : c.key === "voz" ? "text-purple-400" : "text-[#99c9ff]",
                      })),
                  ].slice(0, 5).map((s) => (
                    <div key={s.label} className="bg-white/[.02] border border-white/[.08] rounded-xl p-5 hover:bg-white/[.04] transition-colors">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">{s.label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Banner prueba */}
                {sub?.status === "trialing" && sub.trial_ends_at && (
                  <div className="rounded-xl border border-[#0f7eff]/25 bg-gradient-to-br from-[#0f7eff]/12 to-[#3392ff]/5 p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">Estás en periodo de prueba</p>
                      <p className={`text-sm ${textMuted} mt-0.5`}>Termina el {fmtDate(sub.trial_ends_at)}. Activa un plan para continuar sin interrupciones.</p>
                    </div>
                    <button
                      onClick={() => { setTab("plans"); setShowPlanPicker(true); }}
                      className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0f7eff] hover:bg-[#3392ff] text-white text-sm font-semibold transition-colors"
                    >
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
                {invoicePdfMsg && (
                  <p className="text-xs text-red-400">{invoicePdfMsg}</p>
                )}

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
                                <Badge variant={s.variant} icon={inv.status === "paid" ? CheckCircle2 : undefined}>
                                  {s.label}
                                </Badge>
                              </td>
                              <td className={registryTableCell}>
                                <p className="text-sm font-bold text-white">${inv.amount_usd.toFixed(2)}</p>
                                <p className="text-[10px] text-gray-500">${fmtN(inv.amount_cop)} COP</p>
                              </td>
                              <td className={registryTableCell}>
                                <div className="flex items-center gap-1 text-gray-500">
                                  {/* Solo se puede pagar desde aquí la factura del plan
                                      ACTUAL de la org — una factura vieja de un plan ya
                                      reemplazado no debe pagarse por este botón, porque el
                                      checkout fijaría ese plan viejo como el plan vigente. */}
                                  {(inv.status === "pending" || inv.status === "overdue") &&
                                    sub?.billing_provider !== "paddle" &&
                                    inv.plan_id === sub?.plan_id && (
                                      <button
                                        onClick={() => openPlanCheckout(
                                          "/api/billing/paddle/checkout",
                                          { plan_id: sub!.plan_id },
                                          () => void load()
                                        )}
                                        disabled={payingPlan}
                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[var(--nv-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                                      >
                                        {payingPlan ? "Abriendo…" : "Pagar"}
                                      </button>
                                  )}
                                  {inv.paddle_transaction_id && inv.status === "paid" ? (
                                    <>
                                      <button
                                        className="p-1.5 hover:bg-white/[.06] rounded-md hover:text-white"
                                        title="Ver factura Paddle"
                                        onClick={() => {
                                          setInvoicePdfMsg("");
                                          void openInvoicePdf(inv.id).catch((e) =>
                                            setInvoicePdfMsg(e instanceof Error ? e.message : "No se pudo abrir la factura")
                                          );
                                        }}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        className="p-1.5 hover:bg-white/[.06] rounded-md hover:text-white"
                                        title="Descargar factura Paddle"
                                        onClick={() => {
                                          setInvoicePdfMsg("");
                                          void openInvoicePdf(inv.id).catch((e) =>
                                            setInvoicePdfMsg(e instanceof Error ? e.message : "No se pudo abrir la factura")
                                          );
                                        }}
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-gray-600 px-1" title="Factura interna, sin PDF de Paddle">—</span>
                                  )}
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
                TAB 3 — PLANES: solo el plan actual + "Ajustar plan"
                (estilo Claude/Anthropic — no un muro de todos los planes)
            ══════════════════════════════════════════════════════ */}
            {tab === "plans" && !showPlanPicker && (
              <div className="max-w-2xl space-y-5">
                <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg-module)] p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-xs text-[var(--nv-text-muted)] font-medium uppercase tracking-wide mb-1.5">
                        Plan actual
                      </p>
                      <p className="text-2xl font-bold capitalize text-[var(--nv-text)]">{planName}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                        {planPromo?.label && (
                          <span className="text-[10px] text-[#2f8fff] bg-[#072b55]/60 px-2 py-0.5 rounded-md font-medium">
                            {planPromo.label}
                          </span>
                        )}
                      </div>
                    </div>
                    {effectivePriceUsd > 0 && (
                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-[var(--nv-text)]">
                          US$ {fmtN(effectivePriceUsd)}
                          <span className="text-sm font-normal text-[var(--nv-text-muted)]">/mes</span>
                        </p>
                        {planPromo?.price_discount_pct ? (
                          <p className="text-xs text-[var(--nv-text-faint)] line-through">${fmtN(planPromo.price_usd_catalog)} USD/mes</p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-5 border-t border-[var(--nv-border)] space-y-2">
                    <div className="flex justify-between text-[11px] text-[var(--nv-text-muted)] mb-1">
                      <span>Créditos usados</span>
                      <span>{fmtN(usedCredits)} / {fmtN(planMonthlyCredits)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--nv-bg-control)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-[var(--nv-hubspot-teal)]" : "bg-[var(--nv-accent)]"}`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-[var(--nv-border)] flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs text-[var(--nv-text-muted)]">Próxima renovación</p>
                      <p className="text-sm font-semibold text-[var(--nv-text)]">
                        {fmtDate(wallet?.period_end ?? null)}
                        {daysLeft != null && (
                          <span className={`ml-2 font-normal ${daysLeft <= 5 ? "text-amber-400" : "text-[var(--nv-text-muted)]"}`}>
                            en {daysLeft} día{daysLeft === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                      {nextDueInvoice && (
                        <p className={`text-xs mt-1 ${nextDueInvoice.status === "overdue" ? "text-red-400" : "text-amber-400"}`}>
                          Factura {nextDueInvoice.status === "overdue" ? "vencida" : "pendiente"}: vence {fmtDate(nextDueInvoice.due_date)}
                          {dueDaysLeft != null && dueDaysLeft >= 0 ? ` (en ${dueDaysLeft} día${dueDaysLeft === 1 ? "" : "s"})` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowPlanPicker(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--nv-border-strong)] hover:border-[var(--nv-accent)]/50 hover:bg-[var(--nv-hover)] text-sm font-semibold text-[var(--nv-text)] transition-colors"
                    >
                      Ajustar plan <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {sub?.billing_provider === "paddle" && (
                    <div className="mt-4 pt-4 border-t border-[var(--nv-border)] space-y-3">
                      {paymentMethod?.last4 && (
                        <div className="flex items-center justify-between rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2">
                          <span className="flex items-center gap-2 text-xs text-[var(--nv-text)]">
                            <CardBrandIcon brand={paymentMethod.brand} />
                            {paymentMethod.brand ? `${paymentMethod.brand.charAt(0).toUpperCase()}${paymentMethod.brand.slice(1)}` : "Tarjeta"}
                            {" "}•••• {paymentMethod.last4}
                          </span>
                          <button
                            onClick={handleOpenPortal}
                            disabled={portalBusy}
                            className="text-[11px] font-semibold text-[#99c9ff] hover:underline disabled:opacity-50"
                          >
                            {portalBusy ? "Abriendo…" : "Cambiar"}
                          </button>
                        </div>
                      )}

                      {sub.paddle_cancel_scheduled_at ? (
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <p className="text-xs text-amber-400">
                            Tu plan se cancela el {fmtDate(sub.paddle_cancel_scheduled_at)} — conservas acceso hasta esa fecha.
                          </p>
                          <button
                            onClick={handleResumePlan}
                            disabled={cancelBusy}
                            className="text-xs font-semibold text-[#99c9ff] hover:underline disabled:opacity-50"
                          >
                            {cancelBusy ? "Deshaciendo…" : "Deshacer cancelación"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 flex-wrap">
                          {!paymentMethod?.last4 && (
                            <button
                              onClick={handleOpenPortal}
                              disabled={portalBusy}
                              className="text-xs font-semibold text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] transition-colors disabled:opacity-50"
                            >
                              {portalBusy ? "Abriendo…" : "Actualizar método de pago"}
                            </button>
                          )}
                          <button
                            onClick={() => { setBuyPackageId(null); setShowBuyCredits(true); }}
                            className="text-xs font-semibold text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] transition-colors"
                          >
                            Comprar créditos
                          </button>
                          <button
                            onClick={() => { setCancelMsg(""); setShowCancelConfirm(true); }}
                            className="text-xs font-semibold text-red-400/80 hover:text-red-400 transition-colors"
                          >
                            Cancelar plan
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showCancelConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
                <div className="w-full max-w-sm rounded-2xl bg-[var(--nv-bg-module)] border border-[var(--nv-border)] p-6 space-y-4">
                  <h3 className="text-base font-bold text-[var(--nv-text)]">¿Cancelar tu plan?</h3>
                  <p className="text-sm text-[var(--nv-text-muted)]">
                    Conservas acceso completo hasta el{" "}
                    <span className="font-semibold text-[var(--nv-text)]">{fmtDate(wallet?.period_end ?? null)}</span>,
                    fin del ciclo ya pagado. Después no se te cobrará de nuevo y tu cuenta pasará a suspendida.
                    Puedes deshacer la cancelación en cualquier momento antes de esa fecha.
                  </p>
                  {cancelMsg && <p className="text-xs text-red-400">{cancelMsg}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]"
                    >
                      Volver
                    </button>
                    <button
                      onClick={handleCancelPlan}
                      disabled={cancelBusy}
                      className="px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                    >
                      {cancelBusy ? "Cancelando…" : "Sí, cancelar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showBuyCredits && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
                <div className="w-full max-w-sm rounded-2xl bg-[var(--nv-bg-module)] border border-[var(--nv-border)] p-6 space-y-4">
                  <h3 className="text-base font-bold text-[var(--nv-text)]">¿Necesitas más créditos?</h3>
                  <p className="text-sm text-[var(--nv-text-muted)]">Elige un monto. Siempre puedes comprar más después.</p>

                  <div className="grid grid-cols-2 gap-2">
                    {(data?.credit_packages ?? []).map((p) => {
                      const selected = buyPackageId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setBuyPackageId(p.id)}
                          className={`relative rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-[var(--nv-accent)] bg-[var(--nv-accent)]/15"
                              : "border-[var(--nv-border)] hover:border-[var(--nv-border-strong)]"
                          }`}
                        >
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[var(--nv-accent)] flex items-center justify-center">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </span>
                          )}
                          <p className="text-sm font-bold text-[var(--nv-text)]">US$ {fmtN(p.price_usd)}</p>
                          <p className="text-[11px] text-[var(--nv-text-muted)] mt-0.5">{fmtN(p.credits)} créditos</p>
                        </button>
                      );
                    })}
                  </div>

                  {buyPackageId && (
                    <div className="rounded-lg bg-[var(--nv-bg-control)] px-3 py-2 flex items-center justify-between text-sm">
                      <span className="text-[var(--nv-text-muted)]">Total a pagar</span>
                      <span className="font-bold text-[var(--nv-text)]">
                        US$ {fmtN(data?.credit_packages?.find(p => p.id === buyPackageId)?.price_usd ?? 0)}
                      </span>
                    </div>
                  )}

                  {buyCreditsError && <p className="text-xs text-red-400">{buyCreditsError}</p>}
                  <p className="text-[11px] text-[var(--nv-text-faint)]">
                    Se cobra a tu tarjeta al confirmar el pago.
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowBuyCredits(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]"
                    >
                      Volver
                    </button>
                    <button
                      onClick={() => {
                        if (!buyPackageId) return;
                        void openCreditsCheckout("/api/billing/credits/checkout", { package_id: buyPackageId }, () => {
                          setShowBuyCredits(false);
                          void load();
                        });
                      }}
                      disabled={buyingCredits || !buyPackageId}
                      className={`${btnPrimary} disabled:opacity-50`}
                    >
                      {buyingCredits ? "Abriendo…" : "Comprar ahora"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "plans" && showPlanPicker && (
              <div className="max-w-5xl space-y-5">
                <button
                  onClick={() => setShowPlanPicker(false)}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] transition-colors"
                >
                  ← Volver a mi plan
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {plans.map(p => {
                    const isActive  = p.id === sub?.plan_id;
                    const copy      = PLAN_COPY[p.id] ?? { tagline: "", features: [], ideal: "" };
                    const callsEst  = p.monthly_credits > 0 ? Math.floor(p.monthly_credits / voiceCreditsPerMin) : 0;
                    const displayPrice = isActive && planPromo ? planPromo.price_usd : p.price_usd;
                    const displayCredits = isActive ? planMonthlyCredits : p.monthly_credits;
                    const callsEstActive = displayCredits > 0 ? Math.floor(displayCredits / voiceCreditsPerMin) : callsEst;

                    return (
                      <div
                        key={p.id}
                        className={`relative rounded-xl border flex flex-col transition-all bg-[var(--nv-bg-module)] ${
                          isActive
                            ? "border-[var(--nv-accent)]/40 shadow-sm"
                            : "border-[var(--nv-border)] hover:border-[var(--nv-border-strong)]"
                        }`}
                      >
                        {/* Badges */}
                        {p.id === "paddle_qa" && !isActive && (
                          <Badge
                            variant="accent"
                            uppercase
                            className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                          >
                            QA interno
                          </Badge>
                        )}
                        {p.id === "crecimiento" && !isActive && (
                          <Badge
                            variant="accent"
                            uppercase
                            className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                          >
                            Más popular
                          </Badge>
                        )}
                        {isActive && (
                          <Badge
                            variant="emerald"
                            uppercase
                            icon={Star}
                            className="absolute -top-2.5 left-4"
                          >
                            Plan actual
                          </Badge>
                        )}
                        {isActive && planPromo?.label && (
                          <Badge
                            variant="accent"
                            uppercase
                            title={planPromo.label}
                            className="absolute -top-2.5 right-4 max-w-[140px] truncate"
                          >
                            {planPromo.label}
                          </Badge>
                        )}

                        <div className="p-5 flex-1 space-y-4">
                          {/* Nombre + precio */}
                          <div>
                            <h3 className="text-sm font-bold text-[var(--nv-text)]">{p.name}</h3>
                            <p className="text-[11px] text-[var(--nv-text-muted)] mt-0.5 leading-relaxed">{copy.tagline}</p>
                          </div>
                          <div className="flex items-baseline gap-1 flex-wrap">
                            {isActive && planPromo?.price_discount_pct ? (
                              <>
                                <span className="text-sm text-[var(--nv-text-muted)] line-through mr-1">${fmtN(p.price_usd)}</span>
                                <span className="text-xs text-[var(--nv-text-faint)]">US$</span>
                                <span className="text-3xl font-extrabold text-green-400">{fmtN(displayPrice)}</span>
                                <span className="text-xs text-[var(--nv-text-muted)]">/mes</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-[var(--nv-text-faint)]">US$</span>
                                <span className="text-3xl font-extrabold text-[var(--nv-text)]">{fmtN(displayPrice)}</span>
                                <span className="text-xs text-[var(--nv-text-muted)]">/mes</span>
                              </>
                            )}
                          </div>

                          {/* Barra de créditos si es el plan activo */}
                          {isActive && (
                            <div className="py-3 border-y border-[var(--nv-border)] space-y-2">
                              <div>
                                <div className="flex justify-between text-[10px] text-[var(--nv-text-muted)] mb-1.5">
                                  <span>Créditos usados</span>
                                  <span>{fmtN(wallet?.used_credits ?? 0)} / {fmtN(planMonthlyCredits)}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--nv-bg-control)] overflow-hidden">
                                  <div className="h-full bg-[var(--nv-accent)] rounded-full" style={{ width: `${usedPct}%` }} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Créditos del plan */}
                          <p className="text-xs font-semibold text-[var(--nv-hubspot-teal)]">
                            {isActive && planPromo?.credits_bonus_pct ? (
                              <>
                                {fmtN(displayCredits)} créditos/mes
                                <span className="text-[var(--nv-text-muted)] line-through font-normal ml-1">{fmtN(p.monthly_credits)}</span>
                                <span className="text-green-400 font-normal ml-1">+{planPromo.credits_bonus_pct}%</span>
                              </>
                            ) : (
                              <>{fmtN(displayCredits)} créditos/mes</>
                            )}
                            {p.max_users != null && (
                              <span className="text-[var(--nv-text-muted)] font-normal ml-1">· hasta {p.max_users} usuarios</span>
                            )}
                            {p.max_users == null && p.price_usd > 0 && (
                              <span className="text-[var(--nv-text-muted)] font-normal ml-1">· usuarios ilimitados</span>
                            )}
                            {p.trial_days > 0 && <span className="text-[var(--nv-text-faint)] font-normal ml-1">· {p.trial_days} días gratis</span>}
                          </p>

                          {/* Features */}
                          <ul className="space-y-1.5 text-xs">
                            {copy.features.map(f => (
                              <li key={f} className="flex items-start gap-2">
                                <CheckCircle2 className="w-3 h-3 text-[#0f7eff] shrink-0 mt-0.5" />
                                <span className="text-[var(--nv-text-muted)]">{f}</span>
                              </li>
                            ))}
                          </ul>

                          {/* Ideal para */}
                          <p className="text-[10px] text-[var(--nv-text-faint)] italic">{copy.ideal}</p>
                        </div>

                        {/* Pie de tarjeta */}
                        {callsEstActive > 0 && (
                          <div className="px-5 pb-5">
                            <div className="rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] p-3 text-center">
                              <p className="text-[9px] text-[var(--nv-text-muted)] font-semibold uppercase tracking-wide flex items-center justify-center gap-1 mb-1">
                                <Phone className="w-2.5 h-2.5" /> Aprox. en llamadas de voz
                              </p>
                              <p className="text-sm font-bold text-[var(--nv-text)]">{fmtN(callsEstActive)} min/mes</p>
                              <p className="text-[9px] text-[var(--nv-text-muted)]">a {voiceCreditsPerMin} créditos / minuto</p>
                            </div>
                          </div>
                        )}
                        {/* El botón de pago con tarjeta debe verse incluso en el plan activo
                            cuando el cliente todavía paga por transferencia (billing_provider
                            !== 'paddle') — si no, un cliente en modo manual no tiene ninguna
                            forma de pagar su plan actual desde el panel. */}
                        {p.price_usd > 0 && (!isActive || sub?.billing_provider !== "paddle") && (
                          <div className="px-5 pb-5">
                            <PaddleCheckoutButton
                            planId={p.id}
                            planName={p.name}
                            onCheckoutCompleted={() => { void load(); setShowPlanPicker(false); }}
                          />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Nota informativa */}
                <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] p-4 flex items-start gap-3 text-sm text-[var(--nv-text-muted)]">
                  <Info className="w-4 h-4 text-[#0f7eff] shrink-0 mt-0.5" />
                  <p>
                    Al elegir un plan pagas con tarjeta al instante y el cambio aplica de inmediato.
                    ¿Dudas, quieres un plan a la medida o prefieres pagar por transferencia? Escríbenos a{" "}
                    <a href="mailto:info@bgsoluciones.com.co" className="text-[#99c9ff] hover:underline">info@bgsoluciones.com.co</a>.
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
                          <th className={registryTableHeadCell}>Fecha</th>
                          <th className={registryTableHeadCell}>Nombre / Canal</th>
                          <th className={registryTableHeadCell}>Tipo</th>
                          <th className={`${registryTableHeadCell} text-right`}>Créditos</th>
                          <th className={registryTableHeadCell}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {uPage.map(u => {
                          const typeCls =
                                u.type === "Agentes de Voz" ? "bg-purple-500/15 text-purple-300" :
                            u.type === "WhatsApp"           ? "bg-green-500/15 text-green-300" :
                            u.type === "ORI"                ? "bg-[#0f7eff]/15 text-[#99c9ff]" :
                            u.type === "Mi Link"            ? "bg-indigo-500/15 text-indigo-300" :
                            u.type === "Documentos"         ? "bg-amber-500/15 text-amber-300" :
                            u.type === "Formularios"        ? "bg-cyan-500/15 text-cyan-300" :
                            u.type === "Cotizaciones"       ? "bg-pink-500/15 text-pink-300" :
                                                              "bg-white/[.06] text-gray-400";
                          return (
                            <tr key={u.id} className={registryTableRow}>
                              <td className={registryTableCellFirst}>
                                <p className="text-xs text-[var(--nv-text-muted)] tabular-nums">{fmtDate(`${u.date}T00:00:00`)}</p>
                              </td>
                              <td className={registryTableCell}>
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
                <div className="flex flex-wrap items-center gap-3 w-full pt-4 pb-2 shrink-0">
                  <div className="flex-1 flex justify-center min-w-0">
                    <RegistryTablePagination
                      {...uPag}
                      onPageChange={uPag.setPage}
                      onPageSizeChange={uPag.setPageSize}
                      label="entradas"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--nv-text)] shrink-0 whitespace-nowrap">
                    <Receipt className="w-4 h-4 text-[#0f7eff] shrink-0" />
                    <span>
                      Total:{" "}
                      <span className="tabular-nums text-[var(--nv-hubspot-teal)]">
                        {fmtN(totalUsageCredits)} cr
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 5 — RECARGA AUTOMÁTICA (inspirado en dashboard/landing Noova)
            ══════════════════════════════════════════════════════ */}
            {tab === "auto" && (
              <div className="max-w-2xl space-y-5">
                {autoLoading ? (
                  <p className="text-sm text-gray-500">Cargando…</p>
                ) : !autoData?.available ? (
                  <InfoBox layout="row" variant="warning" icon={Info}>
                    La recarga automática cobra a la tarjeta guardada en Paddle — actívala primero pagando tu
                    plan con tarjeta desde <strong>Plan actual → Ajustar plan</strong>.
                  </InfoBox>
                ) : (
                  <>
                    <div className={promoCard}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--nv-accent)] flex items-center justify-center shrink-0">
                            <Zap className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="nv-promo-title text-sm font-bold">Recarga automática</h3>
                            <p className="nv-promo-subtitle text-xs mt-0.5">Sin interrupciones en tu operación</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveAutorecharge(!autoData?.settings?.enabled)}
                          disabled={autoSaving}
                          className={`relative w-11 h-6 rounded-full border transition-colors disabled:opacity-50 ${
                            autoData?.settings?.enabled ? "bg-[var(--nv-accent)] border-[var(--nv-accent)]" : "bg-white/[.06] border-white/[.12]"
                          }`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoData?.settings?.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                      <p className="nv-promo-body text-sm leading-relaxed">
                        Configura un umbral mínimo en dólares. Cuando tu saldo baje de ese nivel, se cobra el
                        monto elegido a tu tarjeta guardada, al instante.
                      </p>
                      {autoData?.settings?.admin_enabled === false && (
                        <p className="text-xs text-amber-400 mt-3">
                          Deshabilitada por Noova para esta cuenta. Escríbenos si tienes dudas.
                        </p>
                      )}
                      {autoData?.settings?.last_recharge_at && (
                        <p className="text-[11px] text-gray-500 mt-3">
                          Última recarga: {fmtDate(autoData.settings.last_recharge_at)}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { step: 1, title: "Umbral mínimo",   desc: "Cuando el saldo baja del nivel configurado" },
                        { step: 2, title: "Recarga inmediata", desc: "Se cobra a tu tarjeta guardada al instante" },
                        { step: 3, title: "Desactívala cuando quieras", desc: "Sin compromiso, un clic y queda apagada" },
                      ].map(({ step, title, desc }) => (
                        <div key={step} className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                          <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[#072b55]/60 text-[#2f8fff] text-[10px] font-bold mb-3">{step}</span>
                          <p className="text-xs font-semibold text-white mb-1">{title}</p>
                          <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5 space-y-4">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Configuración</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1.5">Monto a recargar</label>
                          <select
                            value={autoForm.package_credits}
                            onChange={e => setAutoForm(f => ({ ...f, package_credits: Number(e.target.value) }))}
                            className="w-full rounded-lg border border-white/[.12] bg-noova-main px-3 py-2 text-sm text-white"
                          >
                            {(autoData?.packages ?? []).map(p => (
                              <option key={p.id} value={p.credits}>US$ {fmtN(p.price_usd)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1.5">Recargar cuando el saldo baje de (USD)</label>
                          <input
                            type="number"
                            value={Math.round(autoForm.threshold_credits * creditUsdRate * 100) / 100}
                            onChange={e => setAutoForm(f => ({ ...f, threshold_credits: Math.round(Number(e.target.value) / creditUsdRate) }))}
                            className="w-full rounded-lg border border-white/[.12] bg-noova-main px-3 py-2 text-sm text-white"
                          />
                        </div>
                      </div>
                      {autoMsg && <p className="text-xs text-red-400">{autoMsg}</p>}
                      <button
                        onClick={() => handleSaveAutorecharge(autoData?.settings?.enabled ?? true)}
                        disabled={autoSaving}
                        className={`${btnPrimary} w-full justify-center`}
                      >
                        {autoSaving ? "Guardando…" : "Guardar configuración"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
