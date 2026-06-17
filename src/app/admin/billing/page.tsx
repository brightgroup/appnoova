"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard, RefreshCw, TrendingUp, DollarSign, Wallet, X, CheckCircle2,
  Settings2, PlusCircle, MinusCircle, Save, ChevronDown, ChevronUp, StickyNote
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  adminRegistryPage, registryToolbar, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableLoading, registryTableEmpty, textMuted
} from "@/lib/brand-ui";

interface Plan {
  id: string;
  name: string;
  price_usd: number;
  monthly_credits: number;
  sort_order: number;
}

interface Row {
  organization_id: string;
  name: string;
  slug: string;
  org_status: string;
  owner_email: string | null;
  plan_id: string | null;
  status: string | null;
  period_end: string | null;
  trial_ends_at: string | null;
  price_usd: number;
  revenue_cop: number;
  included_credits: number;
  used_credits: number;
  remaining_credits: number;
  used_pct: number;
  credits_charged: number;
  cost_cop: number;
  twilio_cost_cop: number;
  google_cost_cop: number;
  telnyx_cost_cop: number;
  margin_cop: number;
  margin_pct: number | null;
}

interface Totals {
  mrr_usd: number;
  revenue_cop: number;
  cost_cop: number;
  margin_cop: number;
  margin_pct: number | null;
  twilio_cost_cop: number;
  google_cost_cop: number;
  telnyx_cost_cop: number;
}

interface Invoice {
  id: string;
  period_start: string;
  due_date: string;
  amount_usd: number;
  amount_cop: number;
  status: string;
}

interface DetailData {
  organization: { name: string } | null;
  subscription: {
    plan_id?: string;
    status?: string;
    price_usd?: number;
    monthly_credits?: number;
    current_period_start?: string;
    current_period_end?: string;
    notes?: string;
    custom_label?: string;
  } | null;
  wallet: Record<string, unknown> | null;
  usage: { event_type: string; events: number; credits: number; cost_cop: number }[];
  invoices: Invoice[];
  recent_events: {
    id: number; event_type: string; channel: string;
    credits_charged: number; provider: string;
    provider_cost_cop: number; total_tokens: number | null; created_at: string;
  }[];
}

interface SubForm {
  plan_id: string;
  price_usd: string;
  monthly_credits: string;
  status: string;
  notes: string;
  custom_label: string;
}

interface TopupForm {
  credits: string;
  reason: string;
}

const STATUS_BADGE: Record<string, string> = {
  trialing:  "bg-blue-500/20 text-blue-300",
  active:    "bg-green-500/20 text-green-300",
  past_due:  "bg-amber-500/20 text-amber-300",
  suspended: "bg-red-500/20 text-red-300",
  canceled:  "bg-gray-500/20 text-gray-300"
};

const STATUS_OPTIONS = [
  { value: "trialing",  label: "Prueba (trialing)" },
  { value: "active",    label: "Activo" },
  { value: "past_due",  label: "Vencido (past_due)" },
  { value: "suspended", label: "Suspendido" },
  { value: "canceled",  label: "Cancelado" },
];

const INVOICE_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300",
  paid:    "bg-green-500/20 text-green-300",
  overdue: "bg-red-500/20 text-red-300",
  void:    "bg-gray-500/20 text-gray-300"
};

const EVENT_LABELS: Record<string, string> = {
  ori: "ORI", milink: "Mi Link", widget: "Widget", text_test: "Prueba agentes",
  whatsapp_ai: "WhatsApp IA", whatsapp_manual: "WhatsApp manual", voice: "Voz",
  doc_scan: "Documentos", form_fill: "Formularios", quote: "Cotizaciones"
};

function cop(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));
}
function num(n: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const inputCls = "w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#5b5bf6]/60 focus:ring-1 focus:ring-[#5b5bf6]/30";
const labelCls = "block text-xs text-gray-400 mb-1";

export default function AdminBillingPage() {
  const [rows, setRows]     = useState<Row[]>([]);
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [detailOrg, setDetailOrg]       = useState<Row | null>(null);
  const [detail, setDetail]             = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payingId, setPayingId]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [topping, setTopping]           = useState(false);
  const [saveMsg, setSaveMsg]           = useState("");
  const [topupMsg, setTopupMsg]         = useState("");
  const [showNotes, setShowNotes]       = useState(false);

  const [subForm, setSubForm] = useState<SubForm>({
    plan_id: "explorador", price_usd: "", monthly_credits: "",
    status: "active", notes: "", custom_label: ""
  });
  const [topupForm, setTopupForm] = useState<TopupForm>({ credits: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res  = await authFetch("/api/admin/billing");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else {
      setRows(json.rows ?? []);
      setTotals(json.totals ?? null);
      setPlans((json.plans ?? []).sort((a: Plan, b: Plan) => a.sort_order - b.sort_order));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (row: Row) => {
    setDetailOrg(row);
    setDetail(null);
    setDetailLoading(true);
    setSaveMsg("");
    setTopupMsg("");
    setShowNotes(false);
    const res  = await authFetch(`/api/admin/billing/${row.organization_id}`);
    const json = await res.json();
    if (res.ok) {
      setDetail(json);
      const sub = json.subscription;
      setSubForm({
        plan_id:         sub?.plan_id       ?? "explorador",
        price_usd:       sub?.price_usd     != null ? String(sub.price_usd)     : "",
        monthly_credits: sub?.monthly_credits != null ? String(sub.monthly_credits) : "",
        status:          sub?.status        ?? "active",
        notes:           sub?.notes         ?? "",
        custom_label:    sub?.custom_label  ?? "",
      });
    }
    setDetailLoading(false);
  }, []);

  // Cuando cambia el plan seleccionado, sugerir precio/créditos del plan base
  const handlePlanChange = (planId: string) => {
    const p = plans.find((pl) => pl.id === planId);
    setSubForm((f) => ({
      ...f,
      plan_id:         planId,
      price_usd:       f.price_usd       || (p ? String(p.price_usd)       : ""),
      monthly_credits: f.monthly_credits || (p ? String(p.monthly_credits) : ""),
    }));
  };

  const saveSubscription = useCallback(async () => {
    if (!detailOrg) return;
    setSaving(true);
    setSaveMsg("");
    const selectedPlan = plans.find((p) => p.id === subForm.plan_id);
    const planPrice    = selectedPlan?.price_usd ?? 0;
    const planCredits  = selectedPlan?.monthly_credits ?? 0;

    const priceNum   = subForm.price_usd       ? parseFloat(subForm.price_usd)       : null;
    const creditsNum = subForm.monthly_credits  ? parseInt(subForm.monthly_credits)   : null;

    const body: Record<string, unknown> = {
      plan_id:         subForm.plan_id    || null,
      status:          subForm.status     || null,
      notes:           subForm.notes      || null,
      custom_label:    subForm.custom_label || null,
      price_usd:       (priceNum   != null && priceNum   !== planPrice)   ? priceNum   : null,
      monthly_credits: (creditsNum != null && creditsNum !== planCredits) ? creditsNum : null,
    };

    const res = await authFetch(`/api/admin/billing/${detailOrg.organization_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveMsg("Error: " + (json.error ?? "desconocido"));
    } else {
      setSaveMsg("Guardado correctamente");
      await openDetail(detailOrg);
      await load();
    }
    setSaving(false);
  }, [detailOrg, subForm, plans, openDetail, load]);

  const applyTopup = useCallback(async () => {
    if (!detailOrg || !topupForm.credits) return;
    setTopping(true);
    setTopupMsg("");
    const credits = parseInt(topupForm.credits);
    if (isNaN(credits) || credits === 0) {
      setTopupMsg("Ingresa un número distinto de 0");
      setTopping(false);
      return;
    }
    const res = await authFetch(`/api/admin/billing/${detailOrg.organization_id}/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits, reason: topupForm.reason || "Ajuste manual admin" }),
    });
    const json = await res.json();
    if (!res.ok) {
      setTopupMsg("Error: " + (json.error ?? "desconocido"));
    } else {
      setTopupMsg(credits > 0 ? `+${num(credits)} créditos añadidos` : `${num(credits)} créditos removidos`);
      setTopupForm({ credits: "", reason: "" });
      await openDetail(detailOrg);
    }
    setTopping(false);
  }, [detailOrg, topupForm, openDetail]);

  const markPaid = useCallback(async (invoiceId: string, row: Row | null) => {
    setPayingId(invoiceId);
    const res = await authFetch(`/api/admin/billing/invoices/${invoiceId}/pay`, { method: "POST" });
    if (!res.ok) alert((await res.json()).error ?? "Error");
    if (row) await openDetail(row);
    await load();
    setPayingId(null);
  }, [openDetail, load]);

  const selectedPlan = plans.find((p) => p.id === subForm.plan_id);

  return (
    <div className={adminRegistryPage}>
      <div className={`${registryToolbar} flex items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Facturación</h1>
          </div>
          <p className={`text-xs ${textMuted}`}>Consumo, costo real y margen por cliente · periodo vigente</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/[.08]" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className={adminRegistryContent}>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 mb-4">{error}</div>}

        {/* Totales */}
        {totals && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5" /> MRR</p>
              <p className="text-xl font-bold">${num(totals.mrr_usd)}<span className="text-sm text-gray-500"> /mes</span></p>
              <p className="text-xs text-gray-500">{cop(totals.revenue_cop)} COP</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><Wallet className="w-3.5 h-3.5" /> Costo real</p>
              <p className="text-xl font-bold text-amber-300">{cop(totals.cost_cop)}</p>
              <p className="text-xs text-gray-500">proveedores este periodo</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><TrendingUp className="w-3.5 h-3.5" /> Margen</p>
              <p className={`text-xl font-bold ${totals.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(totals.margin_cop)}</p>
              <p className="text-xs text-gray-500">{totals.margin_pct != null ? `${totals.margin_pct}% del ingreso` : "—"}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 mb-1">Costo por proveedor</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">WhatsApp/Twilio</span><span>{cop(totals.twilio_cost_cop)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">IA/Google</span><span>{cop(totals.google_cost_cop)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Voz/Telnyx</span><span>{cop(totals.telnyx_cost_cop)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tabla por cliente */}
        {loading ? (
          <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
        ) : rows.length === 0 ? (
          <div className={registryTableEmpty}>Sin clientes</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[.08]">
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Cliente</th>
                  <th className={registryTableHeadCell}>Plan</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Facturación</th>
                  <th className={registryTableHeadCell}>Créditos</th>
                  <th className={registryTableHeadCell}>Le facturo</th>
                  <th className={registryTableHeadCell}>Mi costo</th>
                  <th className={registryTableHeadCell}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.organization_id} className={`${registryTableRow} cursor-pointer`} onClick={() => openDetail(r)}>
                    <td className={registryTableCellFirst}>
                      <p className="text-sm font-medium text-white">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.owner_email ?? r.slug}</p>
                    </td>
                    <td className={`${registryTableCell} capitalize`}>{r.plan_id ?? "—"}</td>
                    <td className={registryTableCell}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[r.status ?? ""] ?? "bg-gray-500/20 text-gray-300"}`}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-gray-300`}>{fmtDate(r.period_end)}</td>
                    <td className={registryTableCell}>
                      <div className="w-28">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{num(r.used_credits)}</span>
                          <span>{num(r.included_credits)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden">
                          <div className={`h-full ${r.used_pct >= 90 ? "bg-red-500" : r.used_pct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`} style={{ width: `${r.used_pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`${registryTableCell} font-medium`}>{cop(r.revenue_cop)}</td>
                    <td className={`${registryTableCell} text-amber-300`}>{cop(r.cost_cop)}</td>
                    <td className={registryTableCell}>
                      <span className={r.margin_cop >= 0 ? "text-green-300" : "text-red-300"}>
                        {cop(r.margin_cop)} {r.margin_pct != null && <span className="text-xs text-gray-500">({r.margin_pct}%)</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Panel de detalle ─────────────────────────────────────────────────── */}
      {detailOrg && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDetailOrg(null)}>
          <div className="w-full max-w-xl h-full bg-[#12131a] border-l border-white/[.1] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="sticky top-0 bg-[#12131a] flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
              <div>
                <h2 className="text-lg font-semibold">{detailOrg.name}</h2>
                <p className="text-xs text-gray-500">{detailOrg.owner_email}</p>
              </div>
              <button onClick={() => setDetailOrg(null)} className="p-1.5 rounded-lg hover:bg-white/[.08] text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading || !detail ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…
                </div>
              ) : (
                <>
                  {/* ── Gestión del plan ───────────────────────────────────── */}
                  <div className="rounded-xl border border-[#5b5bf6]/30 bg-[#5b5bf6]/[.05] p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings2 className="w-4 h-4 text-[#5b5bf6]" />
                      <h3 className="text-sm font-semibold text-[#9b9bf8]">Gestión del plan</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Plan base */}
                      <div>
                        <label className={labelCls}>Plan base</label>
                        <select
                          value={subForm.plan_id}
                          onChange={(e) => handlePlanChange(e.target.value)}
                          className={inputCls}
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id} className="bg-[#1a1b25]">
                              {p.name} (${p.price_usd}/mes)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Estado */}
                      <div>
                        <label className={labelCls}>Estado</label>
                        <select
                          value={subForm.status}
                          onChange={(e) => setSubForm((f) => ({ ...f, status: e.target.value }))}
                          className={inputCls}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value} className="bg-[#1a1b25]">{s.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Precio USD (con descuento) */}
                      <div>
                        <label className={labelCls}>
                          Precio USD/mes
                          {selectedPlan && (
                            <span className="text-gray-600 ml-1">(estándar: ${selectedPlan.price_usd})</span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={selectedPlan ? String(selectedPlan.price_usd) : "0"}
                          value={subForm.price_usd}
                          onChange={(e) => setSubForm((f) => ({ ...f, price_usd: e.target.value }))}
                          className={inputCls}
                        />
                      </div>

                      {/* Créditos mensuales */}
                      <div>
                        <label className={labelCls}>
                          Créditos/mes
                          {selectedPlan && (
                            <span className="text-gray-600 ml-1">(estándar: {num(selectedPlan.monthly_credits)})</span>
                          )}
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder={selectedPlan ? String(selectedPlan.monthly_credits) : "0"}
                          value={subForm.monthly_credits}
                          onChange={(e) => setSubForm((f) => ({ ...f, monthly_credits: e.target.value }))}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Etiqueta personalizada */}
                    <div className="mb-3">
                      <label className={labelCls}>Etiqueta interna (visible solo para ti)</label>
                      <input
                        type="text"
                        placeholder='ej. "Crecimiento -40% hasta sep 2026"'
                        value={subForm.custom_label}
                        onChange={(e) => setSubForm((f) => ({ ...f, custom_label: e.target.value }))}
                        className={inputCls}
                      />
                    </div>

                    {/* Notas (collapsible) */}
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => setShowNotes((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-1"
                      >
                        <StickyNote className="w-3.5 h-3.5" />
                        Notas internas
                        {showNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {showNotes && (
                        <textarea
                          rows={4}
                          placeholder="Acuerdos, descuentos, historial de cambios..."
                          value={subForm.notes}
                          onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
                          className={`${inputCls} resize-none`}
                        />
                      )}
                    </div>

                    {saveMsg && (
                      <p className={`text-xs mb-2 ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                        {saveMsg}
                      </p>
                    )}

                    <button
                      onClick={saveSubscription}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#5b5bf6] hover:bg-[#4a4ae0] text-white text-sm font-medium disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {saving ? "Guardando…" : "Guardar cambios y activar"}
                    </button>

                    {/* Info rápida de precios del plan seleccionado */}
                    {selectedPlan && (
                      <p className="text-xs text-gray-500 text-center mt-2">
                        Plan <strong>{selectedPlan.name}</strong> estándar: ${selectedPlan.price_usd}/mes · {num(selectedPlan.monthly_credits)} créditos
                        {subForm.price_usd && parseFloat(subForm.price_usd) !== selectedPlan.price_usd && (
                          <span className="text-[#9b9bf8] ml-1">→ precio personalizado: ${subForm.price_usd}</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* ── Resumen financiero ─────────────────────────────────── */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Le facturo</p>
                      <p className="font-bold">{cop(detailOrg.revenue_cop)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Mi costo</p>
                      <p className="font-bold text-amber-300">{cop(detailOrg.cost_cop)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Margen</p>
                      <p className={`font-bold ${detailOrg.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(detailOrg.margin_cop)}</p>
                    </div>
                  </div>

                  {/* ── Ajuste manual de créditos ──────────────────────────── */}
                  <div className="rounded-xl border border-white/[.08] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <PlusCircle className="w-4 h-4 text-green-400" />
                      <h3 className="text-sm font-semibold">Ajuste manual de créditos</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={labelCls}>Créditos (+ añadir / − quitar)</label>
                        <input
                          type="number"
                          placeholder="ej. 50000 o -10000"
                          value={topupForm.credits}
                          onChange={(e) => setTopupForm((f) => ({ ...f, credits: e.target.value }))}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Razón / motivo</label>
                        <input
                          type="text"
                          placeholder='ej. "Cortesía por incidente"'
                          value={topupForm.reason}
                          onChange={(e) => setTopupForm((f) => ({ ...f, reason: e.target.value }))}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    {topupMsg && (
                      <p className={`text-xs mb-2 ${topupMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                        {topupMsg}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={applyTopup}
                        disabled={topping || !topupForm.credits}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/[.06] hover:bg-white/[.1] text-sm disabled:opacity-40"
                      >
                        {topping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5 text-green-400" />}
                        Aplicar ajuste
                      </button>
                      <button
                        onClick={() => {
                          if (topupForm.credits) {
                            setTopupForm((f) => ({ ...f, credits: String(-Math.abs(parseInt(f.credits) || 0)) }));
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-white/[.04] hover:bg-white/[.08] text-xs text-gray-400"
                        title="Invertir signo"
                      >
                        <MinusCircle className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">El ajuste queda registrado en las notas internas de la suscripción.</p>
                  </div>

                  {/* ── Consumo del periodo ────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Consumo del periodo</h3>
                    {detail.usage.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin consumo aún.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...detail.usage].sort((a, b) => b.cost_cop - a.cost_cop).map((u) => (
                          <div key={u.event_type} className="flex items-center justify-between text-sm py-1.5 border-b border-white/[.05]">
                            <span>{EVENT_LABELS[u.event_type] ?? u.event_type} <span className="text-xs text-gray-500">×{num(u.events)}</span></span>
                            <span className="text-gray-300">Cobro {num(u.credits)} · <span className="text-amber-300">costo {cop(u.cost_cop)}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Facturas ───────────────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Facturas</h3>
                    {detail.invoices.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin facturas (plan gratuito o de prueba).</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.invoices.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/[.08] p-3">
                            <div>
                              <p className="text-sm">{fmtDate(inv.period_start)} · ${inv.amount_usd}</p>
                              <p className="text-xs text-gray-500">Vence {fmtDate(inv.due_date)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_BADGE[inv.status] ?? "bg-gray-500/20 text-gray-300"}`}>{inv.status}</span>
                              {(inv.status === "pending" || inv.status === "overdue") && (
                                <button
                                  onClick={() => markPaid(inv.id, detailOrg)}
                                  disabled={payingId === inv.id}
                                  className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                                >
                                  {payingId === inv.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  Marcar pagada
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Últimos consumos ───────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Últimos consumos</h3>
                    <div className="space-y-1 text-xs">
                      {detail.recent_events.slice(0, 20).map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between py-1 border-b border-white/[.04] text-gray-400">
                          <span>{EVENT_LABELS[ev.event_type] ?? ev.event_type}{ev.total_tokens ? ` · ${num(ev.total_tokens)} tok` : ""}</span>
                          <span>{num(ev.credits_charged)} cr · <span className="text-amber-300/80">{cop(ev.provider_cost_cop)}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
