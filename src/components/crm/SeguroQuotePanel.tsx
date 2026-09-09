"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, modalInput } from "@/lib/brand-ui";
import { PlateBadge } from "@/components/crm/PlateBadge";

interface QuoteRequestSummary {
  id: string;
  ramo: string;
  placa: string | null;
  vehiculo: { marca?: string; linea?: string; modelo?: number };
  tomador: { nombre_tomador?: string; documento_tomador?: string };
  estado: string;
  resultado: { aseguradora?: string; prima?: number | null } | null;
  conversationId: string | null;
}

interface Guidance {
  step: "sin_cotizacion" | "cotizar_automatico" | "registrar_manual" | "generar_pdf" | "cerrada";
  message: string;
  quote: QuoteRequestSummary | null;
}

function formatCop(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

/**
 * Panel guiado de cotización de seguro dentro de la ficha del lead —
 * distinto de CrmOriQuotePanel (propuesta comercial genérica de texto). Usa
 * /api/crm/leads/[id]/seguro-cotizacion (misma lógica de guía que la tool de
 * ORI `guiar_cotizacion_seguro`, ver quote-guidance.ts) para saber qué botón
 * mostrar en cada momento — nunca decide el paso por su cuenta.
 */
export function SeguroQuotePanel({ leadId }: { leadId: string }) {
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [manualPrima, setManualPrima] = useState("");
  const [manualAseguradora, setManualAseguradora] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${leadId}/seguro-cotizacion`, { headers });
    const data = await res.json().catch(() => null);
    if (res.ok && data) setGuidance(data);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function solicitarAutomatico() {
    if (!guidance?.quote) return;
    setActing(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${guidance.quote.id}/cotizar`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cotizar");
        return;
      }
      await load();
    } finally {
      setActing(false);
    }
  }

  async function registrarManual() {
    if (!guidance?.quote) return;
    const prima = Number(manualPrima.replace(/[^\d]/g, ""));
    if (!prima) return;
    setActing(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${guidance.quote.id}/registrar-manual`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prima, aseguradora: manualAseguradora.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo registrar el precio");
        return;
      }
      setManualPrima("");
      setManualAseguradora("");
      await load();
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando cotización…
      </div>
    );
  }

  if (!guidance || guidance.step === "sin_cotizacion") {
    return (
      <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
          <p className="text-sm font-medium text-white">Cotización de seguro</p>
        </div>
        <p className="text-xs text-gray-500">{guidance?.message ?? "Sin cotización todavía."}</p>
      </div>
    );
  }

  const { quote } = guidance;

  return (
    <div className="rounded-xl border border-[#0f7eff]/20 bg-[#0f7eff]/[.06] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#6f95f2] shrink-0" />
            <p className="text-sm font-semibold text-white capitalize">Seguro de {quote?.ramo}</p>
            {quote?.placa && <PlateBadge plate={quote.placa} />}
          </div>
          {quote && (
            <p className="text-xs text-gray-400 mt-0.5">
              {[quote.vehiculo?.marca, quote.vehiculo?.linea, quote.vehiculo?.modelo].filter(Boolean).join(" ")}
              {quote.tomador?.nombre_tomador ? ` · ${quote.tomador.nombre_tomador}` : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={load} className={`${btnGhost} !px-2 !py-2 shrink-0`} title="Actualizar">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-gray-300">{guidance.message}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {guidance.step === "cotizar_automatico" && (
        <button
          type="button"
          onClick={solicitarAutomatico}
          disabled={acting}
          className={`${btnPrimary} !text-xs !py-2 gap-1.5`}
        >
          {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Solicitar cotización real
        </button>
      )}

      {guidance.step === "registrar_manual" && (
        <div className="flex items-center gap-2">
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
            onClick={registrarManual}
            disabled={acting || !manualPrima.trim()}
            className={`${btnPrimary} !text-xs !py-1.5 shrink-0 gap-1.5`}
          >
            {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
          </button>
        </div>
      )}

      {guidance.step === "generar_pdf" && quote && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-emerald-400">
            {quote.resultado?.aseguradora ?? "Aseguradora"} · {formatCop(quote.resultado?.prima)}
          </span>
          <a
            href={`/api/seguros/cotizaciones/${quote.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={`${btnPrimary} !text-xs !py-1.5 gap-1.5`}
          >
            <Download className="w-3.5 h-3.5" /> Descargar PDF
          </a>
          {quote.conversationId && (
            <a
              href={`/dashboard/inbox?id=${quote.conversationId}`}
              className={`${btnGhost} !text-xs !py-1.5 gap-1.5`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Enviar por WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
