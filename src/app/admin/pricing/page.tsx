"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Settings2, RefreshCw, Package, DollarSign, Server, Save, Plus, Pencil, Lock,
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { invalidatePricingCatalogCache } from "@/hooks/usePricingCatalog";
import { monthlyCreditsFromPriceUsd, planVolumeMetrics } from "@/lib/billing/plan-credits";
import { creditsFromUsdPrice, usdPriceFromCredits } from "@/lib/billing/credit-usd";
import { referenceMarginPct, referenceProviderCostUsd, referenceCostBreakdown } from "@/lib/billing/reference-margin";
import type { UsageEventType } from "@/lib/billing/pricing-types";
import {
  adminRegistryPage, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty, btnPrimary, btnGhost,
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { AdminStatusBadge } from "@/components/admin/admin-table-styles";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface UnitPrice {
  event_type: string;
  label: string;
  description: string | null;
  unit_label: string;
  category: string;
  price_usd: number;
  credits_cop: number;
  sort_order: number;
  is_active: boolean;
}

interface ProviderRate {
  rate_key: string;
  provider: string;
  label: string;
  description: string | null;
  unit_label: string;
  cost_usd: number;
  sort_order: number;
}

interface Plan {
  id: string;
  name: string;
  price_usd: number;
  monthly_credits: number;
  trial_days: number;
  whatsapp_included: boolean;
  max_text_agents: number | null;
  max_users: number | null;
  support_level: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  is_public: boolean;
  features: Record<string, unknown>;
}

const TABS = [
  { id: "plans", label: "Paquetes", icon: Package },
  { id: "client", label: "Precios al cliente", icon: DollarSign },
  { id: "provider", label: "Costos proveedor", icon: Server },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50";
const inputSm =
  "w-28 rounded-lg border border-white/[.12] bg-white/[.04] px-2 py-1.5 text-sm text-white text-right tabular-nums focus:outline-none focus:border-[#5b5bf6]/50";

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
const fmtUsdShort = (n: number) =>
  n >= 0.01 ? fmtUsd(n) : `$${n.toFixed(6)}`;
const fmtN = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtTrm = (n: number) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtTrmDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const fmtCop = (n: number) => "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));

// ── Componente ────────────────────────────────────────────────────────────────

export default function AdminPricingPage() {
  const [tab, setTab] = useState<TabId>("plans");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [trmCop, setTrmCop] = useState(4200);
  const [creditUsdValue, setCreditUsdValue] = useState(0.0003);
  const [creditUsdDraft, setCreditUsdDraft] = useState("0.0003");
  const [creditsPerUsd, setCreditsPerUsd] = useState(350000 / 82);
  const [unitPrices, setUnitPrices] = useState<UnitPrice[]>([]);
  const [providerRates, setProviderRates] = useState<ProviderRate[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [unitDraft, setUnitDraft] = useState<Record<string, string>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [trmDraft, setTrmDraft] = useState("");
  const [trmEffectiveDate, setTrmEffectiveDate] = useState<string | null>(null);

  const [planModal, setPlanModal] = useState<"create" | Plan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: "", price_usd: "82", monthly_credits: "",
    trial_days: "0",
    whatsapp_included: false, max_text_agents: "", max_users: "",
    support_level: "email", is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/admin/pricing");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Error al cargar");
    } else {
      setTrmCop(Number(json.trm_cop ?? 4200));
      setTrmDraft(String(json.trm_cop ?? 4200));
      setCreditUsdValue(Number(json.credit_usd_value ?? 0.0003));
      setCreditUsdDraft(String(json.credit_usd_value ?? 0.0003));
      setTrmEffectiveDate(json.trm_effective_date ?? null);
      if (json.trm_updated) {
        setMsg(`TRM actualizada a ${fmtTrm(Number(json.trm_cop))} COP/USD (oficial)`);
      }
      setCreditsPerUsd(Number(json.credits_per_usd ?? 350000 / 82));
      setUnitPrices(json.unit_prices ?? []);
      setProviderRates(json.provider_rates ?? []);
      setPlans(json.plans ?? []);
      const ud: Record<string, string> = {};
      for (const u of json.unit_prices ?? []) {
        ud[u.event_type] = String(creditsFromUsdPrice(Number(u.price_usd)));
      }
      setUnitDraft(ud);
      const rd: Record<string, string> = {};
      for (const r of json.provider_rates ?? []) rd[r.rate_key] = String(r.cost_usd);
      setRateDraft(rd);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const providerRatesMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of providerRates) {
      map[r.rate_key] = Number(rateDraft[r.rate_key] ?? r.cost_usd);
    }
    return map;
  }, [providerRates, rateDraft]);

  const previewPlanCredits = useMemo(() => {
    const price = Number(planForm.price_usd);
    return monthlyCreditsFromPriceUsd(price, creditsPerUsd);
  }, [planForm.price_usd, creditsPerUsd]);

  const planFormMetrics = useMemo(() => {
    const price = Number(planForm.price_usd);
    const credits = planForm.monthly_credits.trim()
      ? Math.round(Number(planForm.monthly_credits))
      : previewPlanCredits;
    const creditUsd = Number(creditUsdDraft) || creditUsdValue;
    return planVolumeMetrics(price, credits, creditUsd);
  }, [planForm.price_usd, planForm.monthly_credits, previewPlanCredits, creditUsdDraft, creditUsdValue]);

  async function saveClientTab() {
    setSaving(true);
    setMsg("");
    setError("");

    if (trmDraft !== String(trmCop)) {
      const trmRes = await authFetch("/api/admin/pricing", {
        method: "PATCH",
        body: JSON.stringify({ trm_cop: Number(trmDraft) }),
      });
      if (!trmRes.ok) {
        const j = await trmRes.json();
        setError(j.error ?? "Error al guardar TRM");
        setSaving(false);
        return;
      }
    }

    if (creditUsdDraft !== String(creditUsdValue)) {
      const crRes = await authFetch("/api/admin/pricing", {
        method: "PATCH",
        body: JSON.stringify({ credit_usd_value: Number(creditUsdDraft) }),
      });
      if (!crRes.ok) {
        const j = await crRes.json();
        setError(j.error ?? "Error al guardar valor del crédito");
        setSaving(false);
        return;
      }
    }

    const updates = unitPrices.map((u) => ({
      event_type: u.event_type,
      credits: Math.round(Number(unitDraft[u.event_type] ?? creditsFromUsdPrice(u.price_usd))),
    }));
    const res = await authFetch("/api/admin/pricing/unit-prices", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error");
    else {
      setMsg("Precios al cliente guardados");
      invalidatePricingCatalogCache();
      await load();
    }
    setSaving(false);
  }

  async function saveProviderRates() {
    setSaving(true);
    setMsg("");
    setError("");
    const updates = providerRates.map((r) => ({
      rate_key: r.rate_key,
      cost_usd: Number(rateDraft[r.rate_key] ?? r.cost_usd),
    }));
    const res = await authFetch("/api/admin/pricing/provider-rates", {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error");
    else {
      setMsg("Costos de proveedor guardados");
      invalidatePricingCatalogCache();
      await load();
    }
    setSaving(false);
  }

  function openEditPlan(plan: Plan) {
    setPlanForm({
      name: plan.name,
      price_usd: String(plan.price_usd),
      monthly_credits: String(plan.monthly_credits),
      trial_days: String(plan.trial_days),
      whatsapp_included: plan.whatsapp_included,
      max_text_agents: plan.max_text_agents != null ? String(plan.max_text_agents) : "",
      max_users: plan.max_users != null ? String(plan.max_users) : "",
      support_level: plan.support_level,
      is_active: plan.is_active,
    });
    setPlanModal(plan);
  }

  function openCreatePlan() {
    setPlanForm({
      name: "", price_usd: "82", monthly_credits: "",
      trial_days: "0",
      whatsapp_included: true, max_text_agents: "", max_users: "5",
      support_level: "email", is_active: true,
    });
    setPlanModal("create");
  }

  function applySuggestedCredits() {
    setPlanForm((f) => ({ ...f, monthly_credits: String(previewPlanCredits) }));
  }

  async function savePlan() {
    if (!planModal) return;
    setSaving(true);
    setError("");
    setMsg("");
    const priceUsd = Number(planForm.price_usd);
    const creditsRaw = planForm.monthly_credits.trim();
    const payload: Record<string, unknown> = {
      name: planForm.name,
      price_usd: priceUsd,
      trial_days: Number(planForm.trial_days),
      whatsapp_included: planForm.whatsapp_included,
      max_text_agents: planForm.max_text_agents ? Number(planForm.max_text_agents) : null,
      max_users: planForm.max_users ? Number(planForm.max_users) : null,
      support_level: planForm.support_level,
      is_active: planForm.is_active,
    };

    if (creditsRaw) {
      payload.monthly_credits = Math.round(Number(creditsRaw));
    } else if (planModal === "create" && priceUsd > 0) {
      payload.monthly_credits = previewPlanCredits;
    } else if (planModal !== "create") {
      payload.monthly_credits = Math.round(Number(planForm.monthly_credits));
    }

    const res = planModal === "create"
      ? await authFetch("/api/admin/pricing/plans", { method: "POST", body: JSON.stringify(payload) })
      : await authFetch(`/api/admin/pricing/plans/${planModal.id}`, { method: "PATCH", body: JSON.stringify(payload) });

    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error");
    else {
      setMsg(planModal === "create" ? "Paquete creado" : "Paquete actualizado");
      invalidatePricingCatalogCache();
      setPlanModal(null);
      await load();
    }
    setSaving(false);
  }

  const editingSystem = planModal !== "create" && planModal !== null && planModal.is_system;
  const editingCustom = planModal !== "create" && planModal !== null && !planModal.is_system;

  const toolbarSubtitle =
    tab === "plans"
      ? `${plans.length} paquetes configurados`
      : tab === "client"
        ? `${unitPrices.length} soluciones · 1 crédito = $${creditUsdValue} USD`
        : `${providerRates.length} tarifas de proveedor`;

  const toolbarAction =
    tab === "plans" ? (
      <button type="button" onClick={openCreatePlan} className={`${btnPrimary} flex items-center gap-2 shrink-0`}>
        <Plus className="w-4 h-4" /> Nuevo paquete
      </button>
    ) : (
      <button
        type="button"
        onClick={tab === "client" ? saveClientTab : saveProviderRates}
        disabled={saving}
        className={`${btnPrimary} flex items-center gap-2 shrink-0`}
      >
        <Save className={`w-4 h-4 ${saving ? "animate-pulse" : ""}`} />
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    );

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={Settings2}
        title="Pricing y paquetes"
        subtitle={toolbarSubtitle}
        onRefresh={load}
        refreshing={loading}
        action={toolbarAction}
      />

      <div className="flex gap-0 border-b border-white/[.08] px-5 text-sm shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMsg(""); setError(""); }}
              className={`flex items-center gap-2 px-4 pb-3 pt-2 font-medium border-b-2 transition-colors ${
                tab === t.id ? "text-white border-[#5b5bf6]" : "text-gray-400 border-transparent hover:text-gray-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={adminRegistryContent}>
        {msg && <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-3 text-sm text-green-300 mb-4">{msg}</div>}

        {tab === "plans" && (
          <RegistryTableLayout
            error={error || undefined}
            filters={
              <p className="text-xs text-gray-500">
                Descuento volumen = 1 − (precio ÷ créditos × {creditUsdValue} USD). Promedio catálogo:{" "}
                <span className="text-gray-400 tabular-nums">{fmtN(Math.round(creditsPerUsd))} cr/USD</span>
              </p>
            }
          >
            {loading && !plans.length ? (
              <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
            ) : plans.length === 0 ? (
              <div className={registryTableEmpty}>Sin paquetes</div>
            ) : (
              <table className={registryTable}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Paquete</th>
                    <th className={`${registryTableHeadCell} text-right`}>Precio USD</th>
                    <th className={`${registryTableHeadCell} text-right`}>Créditos/mes</th>
                    <th className={`${registryTableHeadCell} text-right`}>Valor nominal</th>
                    <th className={`${registryTableHeadCell} text-right`}>Desc. volumen</th>
                    <th className={`${registryTableHeadCell} text-right`}>Cr/USD</th>
                    <th className={registryTableHeadCell}>WhatsApp</th>
                    <th className={registryTableHeadCell}>Usuarios</th>
                    <th className={registryTableHeadCell}>Estado</th>
                    <th className={registryTableHeadCell}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => {
                    const vol = planVolumeMetrics(p.price_usd, p.monthly_credits, creditUsdValue);
                    return (
                    <tr key={p.id} className={registryTableRow}>
                      <td className={registryTableCellFirst}>
                        <p className="text-sm font-medium text-white flex items-center gap-1.5">
                          {p.name}
                          {p.is_system && <span title="Sistema"><Lock className="w-3.5 h-3.5 text-amber-500/70" /></span>}
                        </p>
                        <p className="text-xs text-gray-600 font-mono">{p.id}</p>
                        {!p.is_public && !p.is_system && (
                          <p className="text-[10px] text-gray-600">Solo asignado</p>
                        )}
                      </td>
                      <td className={`${registryTableCell} tabular-nums text-sm text-gray-300 text-right`}>
                        {p.price_usd > 0 ? `$${fmtN(p.price_usd)}` : "Gratis"}
                      </td>
                      <td className={`${registryTableCell} tabular-nums text-sm text-white text-right font-medium`}>
                        {fmtN(p.monthly_credits)}
                      </td>
                      <td className={`${registryTableCell} tabular-nums text-sm text-gray-400 text-right`}>
                        {vol.nominal_usd > 0 ? fmtUsd(vol.nominal_usd) : "—"}
                      </td>
                      <td className={`${registryTableCell} tabular-nums text-sm text-right ${
                        vol.volume_discount_pct != null && vol.volume_discount_pct >= 20 ? "text-green-300" : "text-gray-300"
                      }`}>
                        {vol.volume_discount_pct != null ? `${vol.volume_discount_pct}%` : "—"}
                      </td>
                      <td className={`${registryTableCell} tabular-nums text-sm text-gray-400 text-right`}>
                        {vol.credits_per_usd != null ? fmtN(Math.round(vol.credits_per_usd)) : "—"}
                      </td>
                      <td className={registryTableCellMuted}>{p.whatsapp_included ? "Sí" : "No"}</td>
                      <td className={registryTableCellMuted}>{p.max_users ?? "∞"}</td>
                      <td className={registryTableCell}>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${p.is_active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                          {p.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className={registryTableCell}>
                        <button type="button" onClick={() => openEditPlan(p)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[.08] hover:text-white">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        )}

        {tab === "client" && (
          <RegistryTableLayout
            error={error || undefined}
            filters={
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 text-gray-400">
                  <span className="text-xs">1 crédito (USD)</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={creditUsdDraft}
                    onChange={(e) => setCreditUsdDraft(e.target.value)}
                    className={inputSm + " w-28 text-left"}
                  />
                </label>
                <label className="flex items-center gap-2 text-gray-400">
                  <span className="text-xs">TRM ref.</span>
                  <input
                    type="number"
                    step="0.01"
                    value={trmDraft}
                    onChange={(e) => setTrmDraft(e.target.value)}
                    className={inputSm + " w-28 text-left"}
                  />
                </label>
                <span className="text-xs text-gray-500">
                  Edita créditos · USD = créditos × valor del crédito · Costo est. = tarifas proveedor + uso típico
                  {trmEffectiveDate ? ` · TRM ${fmtTrmDate(trmEffectiveDate)}` : ""}
                </span>
              </div>
            }
          >
            {loading && !unitPrices.length ? (
              <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
            ) : (
              <table className={registryTable}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Solución</th>
                    <th className={registryTableHeadCell}>Unidad</th>
                    <th className={`${registryTableHeadCell} text-right`}>Créditos</th>
                    <th className={`${registryTableHeadCell} text-right`}>Precio USD</th>
                    <th className={`${registryTableHeadCell} text-right`}>Costo est.</th>
                    <th className={`${registryTableHeadCell} text-right`}>Ref. COP</th>
                    <th className={`${registryTableHeadCell} text-right`}>Margen ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {unitPrices.map((u) => {
                    const creditUsd = Number(creditUsdDraft) || creditUsdValue;
                    const credits = Math.max(1, Math.round(Number(unitDraft[u.event_type] ?? creditsFromUsdPrice(u.price_usd))));
                    const priceUsd = usdPriceFromCredits(credits, creditUsd);
                    const trm = Number(trmDraft) || trmCop;
                    const copRef = trm > 0 ? Math.round(priceUsd * trm * 100) / 100 : 0;
                    const providerCost = referenceProviderCostUsd(u.event_type as UsageEventType, providerRatesMap);
                    const costBreakdown = referenceCostBreakdown(u.event_type as UsageEventType, providerRatesMap);
                    const marginPct = referenceMarginPct(priceUsd, providerCost);
                    const costCopRef = trm > 0 ? Math.round(providerCost * trm * 100) / 100 : 0;

                    return (
                      <tr key={u.event_type} className={registryTableRow}>
                        <td className={registryTableCellFirst}>
                          <p className="font-medium text-white">{u.label}</p>
                          <p className="text-xs text-gray-500">{u.event_type}</p>
                        </td>
                        <td className={`${registryTableCell} text-gray-400 text-sm`}>{u.unit_label}</td>
                        <td className={`${registryTableCell} text-right`}>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={unitDraft[u.event_type] ?? ""}
                            onChange={(e) => setUnitDraft((d) => ({ ...d, [u.event_type]: e.target.value }))}
                            className={inputSm + " w-24"}
                          />
                        </td>
                        <td className={`${registryTableCell} text-right text-gray-300 tabular-nums text-sm`}>
                          {fmtUsd(priceUsd)}
                        </td>
                        <td className={`${registryTableCell} text-right tabular-nums`}>
                          <p className="text-sm text-amber-300/90">{fmtUsdShort(providerCost)}</p>
                          {costBreakdown.map((line) => (
                            <p key={line.label} className="text-[10px] text-gray-500 leading-snug">
                              {line.label}: {fmtUsdShort(line.usd)}
                            </p>
                          ))}
                          {costCopRef > 0 && (
                            <p className="text-[10px] text-gray-600 mt-0.5">≈ {fmtCop(costCopRef)} ref.</p>
                          )}
                        </td>
                        <td className={`${registryTableCell} text-right text-gray-400 tabular-nums`}>{fmtCop(copRef)}</td>
                        <td className={`${registryTableCell} text-right text-sm ${marginPct != null && marginPct < 30 ? "text-red-300" : "text-green-300"}`}>
                          {marginPct != null ? `${marginPct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        )}

        {tab === "provider" && (
          <RegistryTableLayout
            error={error || undefined}
            filters={
              <p className="text-xs text-gray-500">
                Costos reales de proveedor. Si Twilio, ElevenLabs o Google cambian tarifas, actualízalo aquí.
              </p>
            }
          >
            {loading && !providerRates.length ? (
              <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
            ) : (
              <table className={registryTable}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Proveedor</th>
                    <th className={registryTableHeadCell}>Concepto</th>
                    <th className={registryTableHeadCell}>Unidad</th>
                    <th className={`${registryTableHeadCell} text-right`}>Costo USD</th>
                    <th className={`${registryTableHeadCell} text-right`}>≈ COP</th>
                  </tr>
                </thead>
                <tbody>
                  {providerRates.map((r) => {
                    const usd = Number(rateDraft[r.rate_key] ?? r.cost_usd);
                    return (
                      <tr key={r.rate_key} className={registryTableRow}>
                        <td className={registryTableCellFirst}>
                          <span className="text-xs uppercase tracking-wide text-gray-500">{r.provider}</span>
                        </td>
                        <td className={registryTableCell}>
                          <p className="font-medium text-white">{r.label}</p>
                          {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                        </td>
                        <td className={`${registryTableCell} text-gray-400 text-sm`}>{r.unit_label}</td>
                        <td className={`${registryTableCell} text-right`}>
                          <input
                            type="number"
                            min={0}
                            step="0.000001"
                            value={rateDraft[r.rate_key] ?? ""}
                            onChange={(e) => setRateDraft((d) => ({ ...d, [r.rate_key]: e.target.value }))}
                            className={inputSm + " w-36"}
                          />
                        </td>
                        <td className={`${registryTableCell} text-right text-gray-400 tabular-nums`}>
                          ${fmtN(usd * trmCop)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        )}
      </div>

      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-white/[.12] bg-[#12131a] p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">
              {planModal === "create" ? "Nuevo paquete" : `Editar ${planModal.name}`}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Ajusta precio y créditos para controlar el descuento por volumen. Valor nominal = créditos × {creditUsdValue} USD.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
                <input className={inputCls} value={planForm.name} onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Precio USD/mes</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    className={inputCls}
                    value={planForm.price_usd}
                    onChange={(e) => setPlanForm((f) => ({ ...f, price_usd: e.target.value }))}
                    disabled={
                      planModal !== "create" && editingSystem && planModal.id === "explorador"
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Créditos/mes</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={inputCls}
                    value={planForm.monthly_credits}
                    onChange={(e) => setPlanForm((f) => ({ ...f, monthly_credits: e.target.value }))}
                    placeholder={planModal === "create" ? String(previewPlanCredits) : undefined}
                  />
                </div>
              </div>
              {(planModal === "create" || editingCustom) && Number(planForm.price_usd) > 0 && (
                <button
                  type="button"
                  onClick={applySuggestedCredits}
                  className="text-xs text-[#a5a5ff] hover:text-white transition-colors"
                >
                  Usar sugerido del promedio ({fmtN(previewPlanCredits)} cr · {fmtN(Math.round(creditsPerUsd))} cr/USD)
                </button>
              )}
              <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor nominal</p>
                  <p className="text-sm font-bold text-white tabular-nums mt-1">
                    {planFormMetrics.nominal_usd > 0 ? fmtUsd(planFormMetrics.nominal_usd) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Desc. volumen</p>
                  <p className={`text-sm font-bold tabular-nums mt-1 ${
                    planFormMetrics.volume_discount_pct != null && planFormMetrics.volume_discount_pct >= 20
                      ? "text-green-300"
                      : "text-white"
                  }`}>
                    {planFormMetrics.volume_discount_pct != null
                      ? `${planFormMetrics.volume_discount_pct}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cr / USD</p>
                  <p className="text-sm font-bold text-[#a5a5ff] tabular-nums mt-1">
                    {planFormMetrics.credits_per_usd != null
                      ? fmtN(Math.round(planFormMetrics.credits_per_usd))
                      : "—"}
                  </p>
                </div>
              </div>
              {editingSystem && (
                <p className="text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Plan de catálogo público — los cambios se reflejan en la landing y cotizador al guardar.
                </p>
              )}
              {(planModal === "create" || editingCustom) && (
                <p className="text-xs text-gray-500 bg-white/[.03] border border-white/[.06] rounded-lg px-3 py-2">
                  Paquete custom: no visible en landing por defecto. Solo asignado manualmente.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Días de prueba</label>
                  <input type="number" className={inputCls} value={planForm.trial_days} onChange={(e) => setPlanForm((f) => ({ ...f, trial_days: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Máx. usuarios</label>
                  <input type="number" className={inputCls} placeholder="Ilimitado" value={planForm.max_users} onChange={(e) => setPlanForm((f) => ({ ...f, max_users: e.target.value }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={planForm.whatsapp_included} onChange={(e) => setPlanForm((f) => ({ ...f, whatsapp_included: e.target.checked }))} className="rounded" />
                WhatsApp incluido
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={planForm.is_active} onChange={(e) => setPlanForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                Paquete activo
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setPlanModal(null)} className={btnGhost}>Cancelar</button>
              <button type="button" onClick={savePlan} disabled={saving || !planForm.name.trim()} className={btnPrimary}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
