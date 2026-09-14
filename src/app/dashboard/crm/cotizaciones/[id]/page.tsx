"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Link2, Loader2, MessageSquare, ShieldCheck } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { PlateBadge } from "@/components/crm/PlateBadge";
import type { QuoteResultPeriodicidad } from "@/lib/insurers/quote-requests-db";

interface QuoteResultado {
  aseguradora?: string;
  prima?: number | null;
  prima_anual?: number | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  nombre_plan?: string;
  descripcion?: string;
  periodicidad?: QuoteResultPeriodicidad;
  incluye?: string[];
  beneficios?: string[];
}

interface QuoteDetail {
  id: string;
  ramo: string;
  placa: string | null;
  tomador: { nombre_tomador?: string; documento_tomador?: string };
  estado: "pendiente" | "cotizada" | "enviada_externa" | "cerrada" | "descartada";
  resultado: QuoteResultado | null;
  conversationId: string | null;
  leadId: string | null;
}

interface Guidance {
  step: "sin_cotizacion" | "cotizar_automatico" | "registrar_manual" | "generar_pdf" | "cerrada";
  message: string;
  quote: QuoteDetail | null;
  leadTitle: string | null;
}

const RAMO_LABEL: Record<string, string> = { autos: "Auto", vida: "Vida", hogar: "Hogar", salud: "Salud" };
const PERIODICIDAD_LABEL: Record<QuoteResultPeriodicidad, string> = {
  mensual: "Mensual",
  anual: "Anual",
  mensual_y_anual: "Mensual y anual",
  pago_unico: "Pago único"
};

function formatCop(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

/**
 * Ficha de una cotización YA REALIZADA (resultado real de una aseguradora) —
 * mientras está en curso, reuniendo datos, vive en /dashboard/crm/solicitudes
 * (entidad separada, ver plan "Solicitudes independientes"). Si esta fila
 * todavía está pendiente, redirige para allá en vez de mostrar un formulario
 * duplicado acá.
 */
function CotizacionFichaContent({ quoteId }: { quoteId: string }) {
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/cotizaciones/${quoteId}`, { headers });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setError(data?.error || "Cotización no encontrada");
      setLoading(false);
      return;
    }
    if (data.quote && data.quote.estado === "pendiente") {
      setRedirecting(true);
      window.location.replace(`/dashboard/crm/solicitudes/${quoteId}`);
      return;
    }
    setGuidance(data);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const quote = guidance?.quote ?? null;

  async function generarLink() {
    setGeneratingLink(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${quoteId}/share-link`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo generar el link");
        return;
      }
      setShareUrl(data.url);
      setCopied(false);
    } finally {
      setGeneratingLink(false);
    }
  }

  async function copiarLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // portapapeles no disponible — el link ya está visible para copiar a mano
    }
  }

  if (redirecting) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <CrmDetailLayout
      backHref={quote?.leadId ? `/dashboard/crm/leads/${quote.leadId}` : "/dashboard/crm/cotizaciones"}
      title={quote ? `Seguro de ${RAMO_LABEL[quote.ramo] ?? quote.ramo}` : "Cotización"}
      subtitle={[guidance?.leadTitle, quote?.tomador?.nombre_tomador].filter(Boolean).join(" · ") || undefined}
      loading={loading}
      error={error}
      wide
    >
      {quote && guidance && (
        <div className="max-w-2xl mx-auto space-y-6">
          {quote.placa && (
            <div className="flex items-center gap-2">
              <PlateBadge plate={quote.placa} />
            </div>
          )}

          <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
            <p className="text-sm font-semibold text-white mb-4">Resultado de la cotización</p>

            {quote.resultado?.aseguradora ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm font-semibold text-emerald-400">{quote.resultado.nombre_plan ?? quote.resultado.aseguradora}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {quote.resultado.aseguradora}
                  {quote.resultado.periodicidad ? ` · ${PERIODICIDAD_LABEL[quote.resultado.periodicidad]}` : ""}
                  {quote.resultado.prima ? ` · ${formatCop(quote.resultado.prima)}/mes` : ""}
                  {quote.resultado.prima_anual ? ` · ${formatCop(quote.resultado.prima_anual)}/año` : ""}
                </p>
                {quote.resultado.descripcion && <p className="text-xs text-gray-400 mt-2">{quote.resultado.descripcion}</p>}
                {quote.resultado.incluye && quote.resultado.incluye.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {quote.resultado.incluye.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{guidance.message}</p>
            )}

            {guidance.step === "generar_pdf" && (
              <div className="mt-4 pt-4 border-t border-white/[.06] flex flex-wrap items-center gap-2">
                <a
                  href={`/api/seguros/cotizaciones/${quoteId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnPrimary} !text-xs !py-1.5 gap-1.5`}
                >
                  <Download className="w-3.5 h-3.5" /> Descargar PDF
                </a>
                <button
                  type="button"
                  onClick={generarLink}
                  disabled={generatingLink}
                  className={`${btnGhost} !text-xs !py-1.5 gap-1.5`}
                >
                  {generatingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Generar link para el cliente
                </button>
                {quote.conversationId && (
                  <a href={`/dashboard/inbox?id=${quote.conversationId}`} className={`${btnGhost} !text-xs !py-1.5 gap-1.5`}>
                    <MessageSquare className="w-3.5 h-3.5" /> Enviar por WhatsApp
                  </a>
                )}
                {shareUrl && (
                  <div className="w-full flex items-center gap-2 mt-1 p-2 rounded-lg bg-black/20 border border-white/[.08]">
                    <input readOnly value={shareUrl} className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-300 outline-none" />
                    <button type="button" onClick={copiarLink} className="shrink-0 text-[11px] text-[#99c9ff] hover:text-white flex items-center gap-1">
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {guidance.step === "cerrada" && (
              <p className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Cotización cerrada — sin acciones pendientes.
              </p>
            )}
          </div>
        </div>
      )}
    </CrmDetailLayout>
  );
}

export default function CotizacionFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <CotizacionFichaContent quoteId={id} />
    </Suspense>
  );
}
