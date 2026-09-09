"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Check, Copy, ExternalLink, HeartPulse, Home, Loader2, MessageSquare, Plus, Send, ShieldCheck, X } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import { InfoBox } from "@/components/ui/InfoBox";
import { Info } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface QuoteRequest {
  id: string;
  ramo: string;
  placa: string | null;
  vehiculo: { marca?: string; linea?: string };
  datosRiesgo: Record<string, string | undefined>;
  tomador: { nombre_tomador?: string; documento_tomador?: string; fecha_nacimiento_tomador?: string };
  estado: "pendiente" | "cotizada" | "enviada_externa" | "cerrada" | "descartada";
  resultado: { aseguradora?: string; prima?: number | null } | null;
  conversationId: string | null;
  leadId: string | null;
  createdAt: string;
}

const RAMO_ICON: Record<string, typeof Car> = { autos: Car, vida: HeartPulse, hogar: Home };

function ramoSummary(r: QuoteRequest): string {
  if (r.ramo === "autos") return [r.vehiculo?.marca, r.vehiculo?.linea].filter(Boolean).join(" ") || "Vehículo";
  if (r.ramo === "vida") return `Vida · suma deseada ${r.datosRiesgo?.suma_asegurada_deseada ?? "—"}`;
  if (r.ramo === "hogar") return `Hogar · ${r.datosRiesgo?.tipo_inmueble ?? "inmueble"} estrato ${r.datosRiesgo?.estrato ?? "—"}`;
  return r.ramo;
}

interface ExternalSource {
  id: string;
  label: string;
  inboundToken: string;
}

function formatCop(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

export default function CotizacionesQueuePage() {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualEntryId, setManualEntryId] = useState<string | null>(null);
  const [manualPrima, setManualPrima] = useState("");
  const [manualAseguradora, setManualAseguradora] = useState("");
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const [reqRes, srcRes] = await Promise.all([
      fetch("/api/seguros/cotizaciones", { headers }),
      fetch("/api/seguros/fuentes-externas", { headers })
    ]);
    if (reqRes.ok) setRequests((await reqRes.json()).requests ?? []);
    if (srcRes.ok) setSources((await srcRes.json()).sources ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCotizar(id: string) {
    setQuotingId(id);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${id}/cotizar`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cotizar");
        return;
      }
      await load();
    } finally {
      setQuotingId(null);
    }
  }

  async function handleRegistrarManual(id: string) {
    const prima = Number(manualPrima.replace(/[^\d]/g, ""));
    if (!prima) return;
    setRegisteringId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${id}/registrar-manual`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prima, aseguradora: manualAseguradora.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo registrar el precio");
        return;
      }
      setManualEntryId(null);
      setManualPrima("");
      setManualAseguradora("");
      await load();
    } finally {
      setRegisteringId(null);
    }
  }

  async function handleDescartar(id: string) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/cotizaciones/${id}/cerrar`, { method: "POST", headers });
    await load();
  }

  async function handleCreateSource() {
    if (!newSourceLabel.trim()) return;
    setCreatingSource(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/fuentes-externas", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ label: newSourceLabel.trim() })
      });
      if (res.ok) {
        setNewSourceLabel("");
        await load();
      }
    } finally {
      setCreatingSource(false);
    }
  }

  function webhookUrl(token: string): string {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/seguros/webhooks/cotizacion-externa/${token}`;
  }

  async function copyUrl(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(webhookUrl(token));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  }

  const pendientes = requests.filter(r => r.estado === "pendiente");
  const atendidas = requests.filter(r => r.estado !== "pendiente" && r.estado !== "descartada");

  return (
    <ChannelListPage
      title="Cotizaciones"
      description="Lo que la IA ya calificó (auto, vida u hogar) y espera que un asesor solicite o registre el precio real."
      loading={loading}
      onRefresh={load}
      refreshing={loading}
      error={error || undefined}
    >
      <div className="space-y-3 mb-8">
        {pendientes.length === 0 ? (
          <div className="rounded-xl border border-white/[.08] bg-black/20 p-8 text-center text-sm text-gray-500">
            No hay cotizaciones pendientes por ahora.
          </div>
        ) : (
          pendientes.map(r => {
            const RamoIcon = RAMO_ICON[r.ramo] ?? Car;
            return (
              <div key={r.id} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#2463eb]/15 flex items-center justify-center shrink-0">
                    <RamoIcon className="w-5 h-5 text-[#6f95f2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">
                      {ramoSummary(r)} {r.placa && <span className="text-gray-500 font-mono text-xs">{r.placa}</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.tomador?.nombre_tomador} · {r.tomador?.documento_tomador}
                    </p>
                  </div>
                  {r.leadId && (
                    <a
                      href={`/dashboard/crm/leads/${r.leadId}`}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/[.06]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Ver oportunidad
                    </a>
                  )}
                  {r.conversationId && (
                    <a
                      href={`/dashboard/inbox?id=${r.conversationId}`}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/[.06]"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Ver chat
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDescartar(r.id)}
                    className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                    title="Descartar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {r.ramo === "autos" ? (
                    <button
                      type="button"
                      onClick={() => handleCotizar(r.id)}
                      disabled={quotingId === r.id}
                      className={`${btnPrimary} !text-xs !py-2 shrink-0 gap-1.5`}
                    >
                      {quotingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Solicitar cotización
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setManualEntryId(manualEntryId === r.id ? null : r.id)}
                      className={`${btnPrimary} !text-xs !py-2 shrink-0 gap-1.5`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Registrar precio
                    </button>
                  )}
                </div>
                {manualEntryId === r.id && (
                  <div className="mt-3 pt-3 border-t border-white/[.06] flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualPrima}
                      onChange={e => setManualPrima(e.target.value)}
                      placeholder="Prima en COP"
                      className={`${modalInput} !py-1.5 !text-xs w-32`}
                    />
                    <input
                      type="text"
                      value={manualAseguradora}
                      onChange={e => setManualAseguradora(e.target.value)}
                      placeholder="Aseguradora (opcional)"
                      className={`${modalInput} !py-1.5 !text-xs flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => handleRegistrarManual(r.id)}
                      disabled={registeringId === r.id || !manualPrima.trim()}
                      className={`${btnPrimary} !text-xs !py-1.5 shrink-0 gap-1.5`}
                    >
                      {registeringId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Guardar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {atendidas.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ya atendidas</p>
          <div className="space-y-2">
            {atendidas.slice(0, 10).map(r => (
              <div key={r.id} className="rounded-xl border border-white/[.06] bg-black/10 p-3 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-300">
                    {ramoSummary(r)} {r.placa && <span className="text-gray-500 font-mono">{r.placa}</span>} — {r.tomador?.nombre_tomador}
                  </p>
                </div>
                {r.leadId && (
                  <a
                    href={`/dashboard/crm/leads/${r.leadId}`}
                    className="shrink-0 text-gray-500 hover:text-white"
                    title="Ver oportunidad"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <Badge variant={r.estado === "cotizada" || r.estado === "enviada_externa" ? "emerald" : "neutral"}>
                  {r.estado === "cotizada" || r.estado === "enviada_externa"
                    ? formatCop(r.resultado?.prima)
                    : r.estado}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Fuentes externas</h3>
        <InfoBox icon={Info} layout="row" variant="neutral" className="p-4 my-3">
          <p className="text-[11px]">
            Para sistemas que puedan enviar resultados de cotización a Noova (ej. Agentemotor) — crea una fuente,
            copia la URL y compártela con ese proveedor. Formato genérico, aún sin integración real probada.
          </p>
        </InfoBox>
        <div className="space-y-2">
          {sources.map(s => (
            <div key={s.id} className="flex items-center gap-2 p-3 rounded-lg bg-black/20 border border-white/[.08]">
              <span className="text-xs font-medium text-white w-28 shrink-0">{s.label}</span>
              <code className="flex-1 min-w-0 text-[11px] text-gray-400 truncate">{webhookUrl(s.inboundToken)}</code>
              <button
                type="button"
                onClick={() => copyUrl(s.id, s.inboundToken)}
                className={`${btnGhost} !px-2.5 !py-1.5 !text-xs shrink-0 gap-1`}
              >
                {copiedId === s.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newSourceLabel}
            onChange={e => setNewSourceLabel(e.target.value)}
            placeholder="Ej. Agentemotor"
            className={`${modalInput} flex-1`}
          />
          <button
            type="button"
            onClick={handleCreateSource}
            disabled={creatingSource || !newSourceLabel.trim()}
            className={`${btnPrimary} !text-xs gap-1.5 shrink-0`}
          >
            <Plus className="w-3.5 h-3.5" /> Crear
          </button>
        </div>
      </div>
    </ChannelListPage>
  );
}
