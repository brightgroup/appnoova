"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  RefreshCw, Save, CheckCircle2, PlusCircle,
  Settings2, StickyNote, ChevronDown, ChevronUp, TrendingUp,
  DollarSign, Wallet, Receipt, Activity, AlertCircle
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { AdminStatusBadge } from "@/components/admin/admin-table-styles";
import {
  adminRegistryPage, textMuted,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableEmpty, btnPrimary
} from "@/lib/brand-ui";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Plan { id: string; name: string; price_usd: number; monthly_credits: number; sort_order: number; }

interface DetailData {
  organization: { id: string; name: string; slug: string; status: string } | null;
  subscription: {
    plan_id?: string; status?: string; price_usd?: number;
    monthly_credits?: number; current_period_start?: string;
    current_period_end?: string; notes?: string; custom_label?: string;
  } | null;
  wallet: {
    included_credits: number; used_credits: number; topup_credits: number;
    period_start: string; period_end: string;
  } | null;
  usage: { event_type: string; events: number; credits: number; cost_cop: number }[];
  invoices: { id: string; period_start: string; due_date: string; amount_usd: number; amount_cop: number; status: string }[];
  recent_events: {
    id: number; event_type: string; channel: string;
    credits_charged: number; provider: string;
    provider_cost_cop: number; total_tokens: number | null; created_at: string;
  }[];
}

interface Row {
  organization_id: string; name: string; owner_email: string | null;
  plan_id: string | null; status: string | null;
  price_usd: number; revenue_cop: number; cost_cop: number; margin_cop: number; margin_pct: number | null;
  included_credits: number; used_credits: number; used_pct: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "trialing",  label: "En prueba (trialing)" },
  { value: "active",    label: "Activo" },
  { value: "past_due",  label: "Vencido (past_due)" },
  { value: "suspended", label: "Suspendido" },
  { value: "canceled",  label: "Cancelado" },
];

const EVENT_LABELS: Record<string, string> = {
  ori: "ORI", milink: "Mi Link", widget: "Widget", text_test: "Prueba",
  whatsapp_ai: "WhatsApp IA", whatsapp_manual: "WhatsApp", voice: "Voz",
  doc_scan: "Documentos", form_fill: "Formularios", quote: "Cotizaciones"
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const cop = (n: number) => "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));
const num = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const inputCls = "w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#5b5bf6]/60 focus:ring-1 focus:ring-[#5b5bf6]/20";
const labelCls = "block text-xs text-gray-400 mb-1.5 font-medium";

// ── Componente ────────────────────────────────────────────────────────────────

export default function AdminBillingDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const [detail,  setDetail]  = useState<DetailData | null>(null);
  const [row,     setRow]     = useState<Row | null>(null);
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [topping, setTopping] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [topupMsg, setTopupMsg] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const [subForm, setSubForm] = useState({
    plan_id: "explorador",
    status: "active", notes: "", custom_label: "",
  });
  const [topupForm, setTopupForm] = useState({ credits: "", reason: "" });

  // Cargar datos del detalle
  const load = useCallback(async () => {
    setLoading(true);
    const [detailRes, overviewRes] = await Promise.all([
      authFetch(`/api/admin/billing/${orgId}`),
      authFetch("/api/admin/billing"),
    ]);
    const detailJson   = await detailRes.json();
    const overviewJson = await overviewRes.json();

    if (detailRes.ok) {
      setDetail(detailJson);
      const sub = detailJson.subscription;
      setSubForm({
        plan_id:         sub?.plan_id        ?? "explorador",
        status:          sub?.status         ?? "active",
        notes:           sub?.notes          ?? "",
        custom_label:    sub?.custom_label   ?? "",
      });
    }
    if (overviewRes.ok) {
      setPlans((overviewJson.plans ?? []).sort((a: Plan, b: Plan) => a.sort_order - b.sort_order));
      const foundRow = (overviewJson.rows ?? []).find((r: Row) => r.organization_id === orgId);
      if (foundRow) setRow(foundRow);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const handlePlanChange = (planId: string) => {
    setSubForm((f) => ({ ...f, plan_id: planId }));
  };

  const saveSubscription = useCallback(async () => {
    setSaving(true); setSaveMsg("");
    const body = {
      plan_id:      subForm.plan_id || null,
      status:       subForm.status  || null,
      notes:        subForm.notes.trim(),
      custom_label: subForm.custom_label.trim(),
    };

    const res  = await authFetch(`/api/admin/billing/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) setSaveMsg("Error: " + (json.error ?? "desconocido"));
    else { setSaveMsg("Guardado correctamente"); await load(); }
    setSaving(false);
  }, [orgId, subForm, load]);

  const applyTopup = useCallback(async () => {
    if (!topupForm.credits) return;
    setTopping(true); setTopupMsg("");
    const credits = parseInt(topupForm.credits);
    if (isNaN(credits) || credits === 0) { setTopupMsg("Ingresa un número distinto de 0"); setTopping(false); return; }

    const res  = await authFetch(`/api/admin/billing/${orgId}/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits, reason: topupForm.reason || "Ajuste manual admin" }),
    });
    const json = await res.json();
    if (!res.ok) setTopupMsg("Error: " + (json.error ?? "desconocido"));
    else { setTopupMsg(credits > 0 ? `+${num(credits)} créditos añadidos` : `${num(Math.abs(credits))} créditos removidos`); setTopupForm({ credits: "", reason: "" }); await load(); }
    setTopping(false);
  }, [orgId, topupForm, load]);

  const markPaid = useCallback(async (invoiceId: string) => {
    setPayingId(invoiceId);
    const res = await authFetch(`/api/admin/billing/invoices/${invoiceId}/pay`, { method: "POST" });
    if (!res.ok) alert((await res.json()).error ?? "Error");
    await load();
    setPayingId(null);
  }, [load]);

  const selectedPlan = plans.find(p => p.id === subForm.plan_id);
  const activePlanId = detail?.subscription?.plan_id ?? subForm.plan_id;
  const activePlan = plans.find(p => p.id === activePlanId);
  const wallet       = detail?.wallet;
  const included     = Number(wallet?.included_credits ?? 0);
  const used         = Number(wallet?.used_credits ?? 0);
  const topup        = Number(wallet?.topup_credits ?? 0);
  const totalCr      = included + topup;
  const usedPct      = totalCr > 0 ? Math.min(100, Math.round((used / totalCr) * 100)) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        backHref="/admin/billing"
        title={loading ? "Cargando…" : (detail?.organization?.name ?? orgId)}
        subtitle={detail?.organization ? (row?.owner_email ?? detail.organization.slug) : "Facturación"}
      />

      {loading ? (
        <div className="flex items-center justify-center py-32 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 text-[#5b5bf6]" /> Cargando…
        </div>
      ) : (
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">

          {/* ── Columna izquierda: info + finanzas + facturas + consumo ──── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Métricas financieras */}
            {row && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3" /> Le facturo
                  </p>
                  <p className="text-lg font-bold">{cop(row.revenue_cop)}</p>
                  <p className={`text-xs ${textMuted} mt-0.5`}>
                    {activePlan?.name ?? row.plan_id ?? "—"} · ${activePlan?.price_usd ?? row.price_usd} USD/mes
                  </p>
                </div>
                <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Wallet className="w-3 h-3" /> Mi costo
                  </p>
                  <p className="text-lg font-bold text-amber-300">{cop(row.cost_cop)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">proveedores</p>
                </div>
                <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" /> Margen
                  </p>
                  <p className={`text-lg font-bold ${row.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(row.margin_cop)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{row.margin_pct != null ? `${row.margin_pct}%` : "—"}</p>
                </div>
                <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Créditos
                  </p>
                  <p className="text-lg font-bold">{num(row.included_credits - row.used_credits)}</p>
                  <div className="mt-1.5 h-1 rounded-full bg-white/[.08] overflow-hidden">
                    <div className={`h-full ${row.used_pct >= 90 ? "bg-red-500" : row.used_pct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`}
                      style={{ width: `${row.used_pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">{row.used_pct}% usado</p>
                </div>
              </div>
            )}

            {/* Consumo del periodo */}
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#5b5bf6]" />
                <h2 className="text-sm font-semibold">Consumo del periodo</h2>
                <span className="text-xs text-gray-500 ml-auto">
                  {fmtDate(wallet?.period_start ?? null)} — {fmtDate(wallet?.period_end ?? null)}
                </span>
              </div>
              {(detail?.usage ?? []).length === 0 ? (
                <p className="text-sm text-gray-500 py-4">Sin consumo en este periodo.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...(detail?.usage ?? [])].sort((a, b) => b.credits - a.credits).map(u => (
                    <div key={u.event_type} className="flex items-center justify-between py-2 border-b border-white/[.04] last:border-0">
                      <span className="text-sm text-gray-200">
                        {EVENT_LABELS[u.event_type] ?? u.event_type}
                        <span className="text-xs text-gray-500 ml-2">×{num(u.events)}</span>
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-medium">{num(u.credits)} cr</span>
                        <span className="text-xs text-amber-300/80 ml-2">{cop(u.cost_cop)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Facturas */}
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[.06]">
                <Receipt className="w-4 h-4 text-[#5b5bf6]" />
                <h2 className="text-sm font-semibold">Facturas</h2>
              </div>
              {(detail?.invoices ?? []).length === 0 ? (
                <p className={`text-sm ${textMuted} p-5`}>Sin facturas todavía.</p>
              ) : (
                <table className={registryTable}>
                  <thead className={registryTableHead}>
                    <tr className={registryTableHeadRow}>
                      <th className={registryTableHeadCell}>Periodo</th>
                      <th className={registryTableHeadCell}>Vence</th>
                      <th className={registryTableHeadCell}>Monto</th>
                      <th className={registryTableHeadCell}>Estado</th>
                      <th className={registryTableHeadCell}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail?.invoices ?? []).map(inv => (
                      <tr key={inv.id} className={registryTableRow}>
                        <td className={registryTableCellFirst}>
                          <p className="text-sm font-medium text-white">{fmtDate(inv.period_start)}</p>
                        </td>
                        <td className={`${registryTableCell} text-gray-400`}>{fmtDate(inv.due_date)}</td>
                        <td className={registryTableCell}>
                          <p className="text-sm font-bold">${inv.amount_usd}</p>
                          <p className="text-[10px] text-gray-500">{cop(inv.amount_cop)} COP</p>
                        </td>
                        <td className={registryTableCell}>
                          <AdminStatusBadge status={inv.status} variant="invoice" />
                        </td>
                        <td className={registryTableCell}>
                          {(inv.status === "pending" || inv.status === "overdue") && (
                            <button
                              onClick={() => markPaid(inv.id)}
                              disabled={payingId === inv.id}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
                            >
                              {payingId === inv.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              Marcar pagada
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Últimos eventos */}
            {(detail?.recent_events ?? []).length > 0 && (
              <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
                <h2 className="text-sm font-semibold mb-3">Últimos consumos</h2>
                <div className="space-y-0.5 text-xs">
                  {(detail?.recent_events ?? []).slice(0, 15).map(ev => (
                    <div key={ev.id} className="flex items-center justify-between py-1.5 border-b border-white/[.03] last:border-0 text-gray-400">
                      <span>{EVENT_LABELS[ev.event_type] ?? ev.event_type}{ev.total_tokens ? ` · ${num(ev.total_tokens)} tok` : ""}</span>
                      <span>{num(ev.credits_charged)} cr · <span className="text-amber-300/70">{cop(ev.provider_cost_cop)}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Columna derecha: gestión ──────────────────────────────────── */}
          <div className="space-y-5">

            {/* Gestión del plan */}
            <div className="rounded-xl border border-[#5b5bf6]/25 bg-[#5b5bf6]/[.04] p-5">
              <div className="flex items-center gap-2 mb-5">
                <Settings2 className="w-4 h-4 text-[#5b5bf6]" />
                <h3 className="text-sm font-semibold text-[#a5a5ff]">Gestión del plan</h3>
              </div>

              <div className="space-y-3">
                {/* Plan base */}
                <div>
                  <label className={labelCls}>Plan base</label>
                  <select value={subForm.plan_id} onChange={e => handlePlanChange(e.target.value)} className={inputCls}>
                    {plans.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#1a1b25]">
                        {p.name} — ${p.price_usd}/mes
                      </option>
                    ))}
                  </select>
                </div>

                {/* Estado */}
                <div>
                  <label className={labelCls}>Estado de la cuenta</label>
                  <select value={subForm.status} onChange={e => setSubForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value} className="bg-[#1a1b25]">{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Resumen del plan (solo lectura — se sincroniza desde catálogo) */}
                {selectedPlan && (
                  <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-3 space-y-1.5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Incluye al activar</p>
                    <p className="text-sm text-white font-medium">
                      ${selectedPlan.price_usd > 0 ? selectedPlan.price_usd : "0"} USD/mes
                      <span className="text-gray-500 font-normal mx-2">·</span>
                      {num(selectedPlan.monthly_credits)} créditos/mes
                    </p>
                    <p className="text-[10px] text-gray-600">
                      Precio y créditos se toman del catálogo en Admin → Pricing → Paquetes.
                    </p>
                  </div>
                )}

                {/* Etiqueta */}
                <div>
                  <label className={labelCls}>Etiqueta promocional (visible para el cliente)</label>
                  <input
                    type="text" placeholder='ej. "Lanzamiento −40% hasta sep 2026"'
                    value={subForm.custom_label}
                    onChange={e => setSubForm(f => ({ ...f, custom_label: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                {/* Notas */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowNotes(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-1.5"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    Notas internas
                    {showNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showNotes && (
                    <textarea
                      rows={3}
                      placeholder="Acuerdos, descuentos, historial..."
                      value={subForm.notes}
                      onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))}
                      className={`${inputCls} resize-none`}
                    />
                  )}
                </div>
              </div>

              {saveMsg && (
                <p className={`text-xs mt-3 ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{saveMsg}</p>
              )}

              <button
                onClick={saveSubscription}
                disabled={saving}
                className={`${btnPrimary} w-full justify-center mt-4`}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Guardando…" : "Asignar plan y sincronizar"}
              </button>

              {selectedPlan && (
                <p className="text-[10px] text-gray-600 text-center mt-2">
                  Activo ahora: {activePlan?.name ?? activePlanId}
                  {activePlan && ` · $${activePlan.price_usd}/mes · ${num(activePlan.monthly_credits)} cr`}
                </p>
              )}
            </div>

            {/* Ajuste manual de créditos */}
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
              <div className="flex items-center gap-2 mb-4">
                <PlusCircle className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold">Ajuste de créditos</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Créditos (+añadir / −quitar)</label>
                  <input
                    type="number"
                    placeholder="ej. 50000 o -10000"
                    value={topupForm.credits}
                    onChange={e => setTopupForm(f => ({ ...f, credits: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Motivo</label>
                  <input
                    type="text"
                    placeholder='ej. "Cortesía por incidente"'
                    value={topupForm.reason}
                    onChange={e => setTopupForm(f => ({ ...f, reason: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
              {topupMsg && (
                <p className={`text-xs mt-2 ${topupMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{topupMsg}</p>
              )}
              <button
                onClick={applyTopup}
                disabled={topping || !topupForm.credits}
                className="w-full mt-4 px-4 py-2 rounded-lg border border-white/[.12] bg-white/[.04] hover:bg-white/[.08] text-sm text-white font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {topping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4 text-green-400" />}
                Aplicar ajuste
              </button>
              <p className="text-[10px] text-gray-600 mt-2 text-center">Queda registrado en las notas de la suscripción.</p>
            </div>

            {/* Info de billetera */}
            {wallet && (
              <div className="rounded-xl border border-white/[.06] bg-white/[.01] p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-3">Billetera del periodo</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Créditos incluidos</span><span className="font-medium">{num(included)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Créditos usados</span><span className="font-medium text-amber-300">{num(used)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Top-up / extra</span><span className="font-medium text-green-300">{num(topup)}</span></div>
                  <div className="flex justify-between border-t border-white/[.06] pt-1.5"><span className="text-gray-400">Disponibles</span><span className="font-bold text-white">{num(totalCr - used)}</span></div>
                  <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden mt-2">
                    <div className={`h-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`} style={{ width: `${usedPct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-600 text-right">{usedPct}% consumido</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
