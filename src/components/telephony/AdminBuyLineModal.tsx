"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Phone, Search, Loader2, ChevronLeft, ChevronRight, Sparkles, AlertCircle,
  Zap, CheckCircle2
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { supabase } from "@/lib/supabase";
import {
  btnPrimary, btnGhost, textMuted,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableRowClickable, registryTableCell, registryTableCellMuted
} from "@/lib/brand-ui";
import { TELEPHONY_COUNTRIES } from "@/lib/telephony/countries";
import { telnyxFeatureLabel } from "@/lib/telephony/feature-labels";
import type { AvailablePhoneNumber } from "@/types/phone-number";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

interface UserOption { id: string; email: string; nombre: string }
interface AgentOption { id: string; name: string }

interface AdminBuyLineModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedUserId?: string | null;
}

type Step = 1 | 2 | 3;

const selectCls =
  "w-full bg-noova-main border border-white/[.12] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50";

const STEPS = [
  { n: 1, label: "Cliente" },
  { n: 2, label: "Buscar número" },
  { n: 3, label: "Confirmar" }
] as const;

function formatLocation(n: AvailablePhoneNumber): string {
  if (n.regions?.length) {
    const parts = n.regions
      .filter(r => !["country_code", "country"].includes(r.type))
      .map(r => r.name);
    if (parts.length) return parts.join(", ");
  }
  return [n.locality, n.region].filter(Boolean).join(", ") || "—";
}

function formatNumberType(type: string | null | undefined): string {
  const map: Record<string, string> = {
    local: "Local",
    toll_free: "Toll-free",
    mobile: "Móvil",
    national: "Nacional",
    shared_cost: "Shared cost"
  };
  return map[type ?? "local"] ?? type ?? "Local";
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const cur = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
}

function TelnyxFeaturesCell({ features }: { features: string[] | undefined }) {
  if (!features?.length) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {features.map(f => (
        <span
          key={f}
          className="inline-flex px-1.5 py-0.5 rounded bg-white/[.06] text-[10px] text-gray-300 whitespace-nowrap"
        >
          {telnyxFeatureLabel(f)}
        </span>
      ))}
    </div>
  );
}

export function AdminBuyLineModal({ open, onClose, onSuccess, preselectedUserId }: AdminBuyLineModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [available, setAvailable] = useState<AvailablePhoneNumber[]>([]);
  const [userId, setUserId] = useState(preselectedUserId ?? "");
  const [agentId, setAgentId] = useState("");
  const [country, setCountry] = useState("CO");
  const [numberType, setNumberType] = useState("local");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [selectedE164, setSelectedE164] = useState("");
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError("");
    setAvailable([]);
    setSelectedE164("");
    setSearched(false);
    setContains("");
    setAreaCode("");
    setNumberType("local");
    setTotalResults(null);
    setUserId(preselectedUserId ?? "");
    supabase.from("users").select("id, email, nombre").order("email").then(({ data }) => {
      setUsers(data ?? []);
    });
  }, [open, preselectedUserId]);

  useEffect(() => {
    if (!userId) { setAgents([]); return; }
    authFetch(`/api/admin/telephony/agents?user_id=${userId}`).then(async res => {
      const data = await res.json();
      setAgents(res.ok ? (data.agents ?? []) : []);
    });
  }, [userId]);

  const handleSearch = useCallback(async () => {
    setSearching(true);
    setError("");
    setAvailable([]);
    setSelectedE164("");
    const params = new URLSearchParams({ country, limit: "50", provider: "telnyx" });
    params.set("number_type", numberType);
    if (areaCode) params.set("area_code", areaCode);
    if (contains) params.set("contains", contains.replace(/\D/g, ""));
    const res = await authFetch(`/api/admin/telephony/search?${params}`);
    const data = await res.json();
    setSearching(false);
    setSearched(true);
    if (!res.ok) {
      setError(data.error ?? "Error al buscar");
      return;
    }
    setAvailable(data.numbers ?? []);
    setTotalResults(typeof data.total_results === "number" ? data.total_results : null);
    if ((data.numbers ?? []).length === 0) {
      setError("Sin números en ese país o filtro. Prueba otro código de área o patrón.");
    }
  }, [country, areaCode, contains, numberType]);

  async function handlePurchase() {
    if (!userId || !selectedE164) return;
    setProvisioning(true);
    setError("");
    const res = await authFetch("/api/admin/telephony/provision", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        e164: selectedE164,
        country_code: country,
        voice_agent_id: agentId || null,
        provider: "telnyx"
      })
    });
    const data = await res.json();
    setProvisioning(false);
    if (!res.ok) {
      setError(data.error ?? "Error al comprar");
      return;
    }
    onSuccess();
    onClose();
  }

  if (!open) return null;

  const selectedUser = users.find(u => u.id === userId);
  const countryInfo = TELEPHONY_COUNTRIES.find(c => c.code === country);
  const selectedNumber = available.find(n => n.e164 === selectedE164);
  const wideModal = step === 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <div
        className={`relative bg-noova-surface border border-white/[.10] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all ${
          wideModal ? "max-w-5xl w-full" : "max-w-lg w-full"
        }`}
      >
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#0f7eff]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative px-8 pt-8 pb-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#0f7eff]" />
            <span className="text-xs font-medium text-[#0f7eff]">Telnyx · Compra de línea</span>
          </div>
          <h2 className="text-xl font-bold text-white">Comprar línea telefónica</h2>
          <p className={`text-sm ${textMuted} mt-1`}>
            {step === 1 && "Asigna la línea a un cliente de Noova"}
            {step === 2 && "Busca números disponibles y elige uno de la tabla"}
            {step === 3 && "Revisa los detalles antes de comprar en Telnyx"}
          </p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-5">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    step > s.n
                      ? "bg-emerald-500/20 text-emerald-400"
                      : step === s.n
                        ? "bg-[#0f7eff] text-white"
                        : "bg-white/[.06] text-gray-500"
                  }`}
                >
                  {step > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}
                </div>
                <span className={`text-[11px] truncate hidden sm:block ${step === s.n ? "text-white" : "text-gray-500"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px ${step > s.n ? "bg-emerald-500/30" : "bg-white/[.08]"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative px-8 pb-4 flex-1 overflow-y-auto min-h-0">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className={`block text-xs ${textMuted}`}>
                Cliente
                <NoovaSelect
                  value={userId}
                  onChange={v => { setUserId(v); setAgentId(""); }}
                  allowEmpty={true}
                  emptyLabel="Seleccionar..."
                  className="mt-1"
                  options={users.map(u => ({
                    value: u.id,
                    label: u.nombre || u.email
                  }))}
                />
              </label>
              <label className={`block text-xs ${textMuted}`}>
                Agente de voz (opcional)
                <NoovaSelect
                  value={agentId}
                  onChange={setAgentId}
                  disabled={!userId}
                  allowEmpty={true}
                  emptyLabel="Sin agente"
                  className="mt-1"
                  options={agents.map(a => ({ value: a.id, label: a.name }))}
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 p-4 rounded-xl border border-white/[.10] bg-noova-main">
                <label className={`block text-[11px] ${textMuted}`}>
                  País
                  <NoovaSelect
                    value={country}
                    onChange={setCountry}
                    allowEmpty={false}
                    className="mt-1"
                    options={TELEPHONY_COUNTRIES.map(c => ({
                      value: c.code,
                      label: `${c.flag} ${c.label}`
                    }))}
                  />
                </label>
                <label className={`block text-[11px] ${textMuted}`}>
                  Tipo (Telnyx)
                  <NoovaSelect
                    value={numberType}
                    onChange={setNumberType}
                    allowEmpty={false}
                    className="mt-1"
                    options={[
                      { value: "local", label: "Local" },
                      { value: "toll_free", label: "Toll-free" },
                      { value: "mobile", label: "Móvil" },
                      { value: "national", label: "Nacional" },
                      { value: "all", label: "Todos" }
                    ]}
                  />
                </label>
                <label className={`block text-[11px] ${textMuted}`}>
                  {country === "US" || country === "CA" ? "Área o estado" : "Código de área"}
                  <input
                    value={areaCode}
                    onChange={e => {
                      const raw = e.target.value;
                      if (/^[A-Za-z]+$/.test(raw)) {
                        setAreaCode(raw.toUpperCase().slice(0, 2));
                      } else {
                        setAreaCode(raw.replace(/\D/g, "").slice(0, 6));
                      }
                    }}
                    placeholder={country === "US" || country === "CA" ? "415 o CA" : "601..."}
                    className={`mt-1 ${selectCls}`}
                  />
                </label>
                <label className={`block text-[11px] ${textMuted}`}>
                  Contiene dígitos
                  <input
                    value={contains}
                    onChange={e => setContains(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="ej. 5550"
                    className={`mt-1 ${selectCls}`}
                  />
                </label>
                <div className="sm:col-span-2 flex items-end">
                  <button onClick={handleSearch} disabled={searching} className={`w-full ${btnPrimary}`}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar en Telnyx
                  </button>
                </div>
              </div>

              {/* Results header */}
              {searched && !searching && available.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className={textMuted}>
                    Mostrando {available.length}
                    {totalResults != null && totalResults > available.length ? ` de ${totalResults}` : ""} · {formatNumberType(numberType === "all" ? "local" : numberType)} · {countryInfo?.label}
                  </span>
                  {selectedE164 && (
                    <span className="text-[#0f7eff] font-mono font-medium">{selectedE164}</span>
                  )}
                </div>
              )}

              {/* Results table */}
              {searching ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Consultando inventario Telnyx...
                </div>
              ) : searched && available.length > 0 ? (
                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                    <table className={`${registryTable} min-w-[880px]`}>
                      <thead className={registryTableHead}>
                        <tr className={registryTableHeadRow}>
                          <th className={`${registryTableHeadCell} w-8`} />
                          <th className={registryTableHeadCell}>Número</th>
                          <th className={registryTableHeadCell}>Ubicación</th>
                          <th className={registryTableHeadCell}>Tipo</th>
                          <th className={registryTableHeadCell}>Features</th>
                          <th className={`${registryTableHeadCell} text-right`}>Mensual</th>
                          <th className={`${registryTableHeadCell} text-right`}>Inicial</th>
                          <th className={`${registryTableHeadCell} text-center`}>Extra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {available.map(n => {
                          const selected = selectedE164 === n.e164;
                          return (
                            <tr
                              key={n.e164}
                              onClick={() => setSelectedE164(n.e164)}
                              className={`${registryTableRowClickable} ${selected ? "bg-[#0f7eff]/[.06]" : ""}`}
                            >
                              <td className={registryTableCell}>
                                <span
                                  className={`block w-4 h-4 rounded-full border-2 ${
                                    selected ? "border-[#0f7eff] bg-[#0f7eff]" : "border-white/20"
                                  }`}
                                >
                                  {selected && (
                                    <span className="block w-full h-full rounded-full scale-[0.45] bg-white" />
                                  )}
                                </span>
                              </td>
                              <td className={registryTableCell}>
                                <span className="font-mono text-sm font-semibold text-white">{n.e164}</span>
                              </td>
                              <td className={`${registryTableCell} text-gray-300 max-w-[180px]`}>
                                <span className="line-clamp-2">{formatLocation(n)}</span>
                              </td>
                              <td className={`${registryTableCell} text-gray-400`}>
                                {formatNumberType(n.number_type)}
                              </td>
                              <td className={registryTableCell}>
                                <TelnyxFeaturesCell features={n.feature_list} />
                              </td>
                              <td className={`${registryTableCell} text-right font-medium text-white tabular-nums`}>
                                {formatMoney(n.monthly_cost_usd, n.currency)}
                              </td>
                              <td className={`${registryTableCell} text-right text-gray-400 tabular-nums`}>
                                {formatMoney(n.upfront_cost_usd, n.currency)}
                              </td>
                              <td className={`${registryTableCell} text-center`}>
                                <div className="flex items-center justify-center gap-1.5">
                                  {n.quickship && (
                                    <span className="text-emerald-400" title="Quickship — activo de inmediato">
                                      <Zap className="w-3 h-3" />
                                    </span>
                                  )}
                                  {n.best_effort && (
                                    <span className="text-[10px] text-amber-400/90" title="Best effort — coincidencia aproximada">
                                      ~
                                    </span>
                                  )}
                                  {!n.quickship && !n.best_effort && (
                                    <span className="text-gray-600">—</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                </div>
              ) : searched && available.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Phone className="w-10 h-10 text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400">No hay números con esos filtros.</p>
                  <p className={`text-xs ${textMuted} mt-1`}>Prueba otro país, código de área o patrón de dígitos.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/[.10] rounded-xl">
                  <Search className="w-10 h-10 text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400">Configura los filtros y pulsa Buscar</p>
                  <p className={`text-xs ${textMuted} mt-1`}>Los resultados aparecerán en la tabla con precios y ubicación</p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <table className={registryTable}>
                  <tbody>
                    <tr className={registryTableRow}>
                      <td className={registryTableCellMuted}>Cliente</td>
                      <td className={`${registryTableCell} text-white text-right`}>{selectedUser?.nombre || selectedUser?.email}</td>
                    </tr>
                    {agentId && (
                      <tr className={registryTableRow}>
                        <td className={registryTableCellMuted}>Agente</td>
                        <td className={`${registryTableCell} text-white text-right`}>
                          {agents.find(a => a.id === agentId)?.name ?? "—"}
                        </td>
                      </tr>
                    )}
                    <tr className={registryTableRow}>
                      <td className={registryTableCellMuted}>País</td>
                      <td className={`${registryTableCell} text-white text-right`}>{countryInfo?.label}</td>
                    </tr>
                    <tr className={registryTableRow}>
                      <td className={registryTableCellMuted}>Número</td>
                      <td className={`${registryTableCell} font-mono font-bold text-white text-right`}>{selectedE164}</td>
                    </tr>
                    {selectedNumber && (
                      <>
                        <tr className={registryTableRow}>
                          <td className={registryTableCellMuted}>Ubicación</td>
                          <td className={`${registryTableCell} text-white text-right`}>{formatLocation(selectedNumber)}</td>
                        </tr>
                        <tr className={registryTableRow}>
                          <td className={registryTableCellMuted}>Costo mensual</td>
                          <td className={`${registryTableCell} text-white text-right tabular-nums`}>
                            {formatMoney(selectedNumber.monthly_cost_usd, selectedNumber.currency)}
                          </td>
                        </tr>
                        {selectedNumber.upfront_cost_usd != null && (
                          <tr className={registryTableRow}>
                            <td className={registryTableCellMuted}>Costo inicial</td>
                            <td className={`${registryTableCell} text-white text-right tabular-nums`}>
                              {formatMoney(selectedNumber.upfront_cost_usd, selectedNumber.currency)}
                            </td>
                          </tr>
                        )}
                        <tr className={registryTableRow}>
                          <td className={registryTableCellMuted}>Features</td>
                          <td className={`${registryTableCell} text-right`}>
                            <TelnyxFeaturesCell features={selectedNumber.feature_list} />
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className={registryTableRow}>
                      <td className={registryTableCellMuted}>Proveedor</td>
                      <td className={`${registryTableCell} text-white text-right uppercase`}>Telnyx</td>
                    </tr>
                  </tbody>
                </table>
              <p className={`text-xs ${textMuted} px-1`}>
                Al confirmar, se realizará la compra en tu cuenta Telnyx y la línea quedará asignada al cliente.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between px-8 py-5 border-t border-white/[.08] shrink-0 bg-noova-surface">
          <button
            onClick={() => {
              if (step === 1) onClose();
              else setStep(s => (s - 1) as Step);
            }}
            className={btnGhost}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>

          {step === 1 && (
            <button
              onClick={() => {
                if (!userId) { setError("Selecciona un cliente"); return; }
                setStep(2);
                setError("");
              }}
              className={btnPrimary}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={() => {
                if (!selectedE164) { setError("Selecciona un número de la tabla"); return; }
                setStep(3);
                setError("");
              }}
              disabled={!selectedE164}
              className={btnPrimary}
            >
              Continuar <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 3 && (
            <button onClick={handlePurchase} disabled={provisioning} className={btnPrimary}>
              {provisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
              Comprar y asignar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
