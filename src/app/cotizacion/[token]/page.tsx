"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { ConnectorIconTile } from "@/components/automations/ConnectorIconTile";

interface PublicQuote {
  ramo: string;
  ramoLabel: string;
  tomadorNombre: string | null;
  resultado: {
    aseguradora?: string;
    prima?: number | null;
    prima_anual?: number | null;
    vigencia_desde?: string | null;
    vigencia_hasta?: string | null;
    aceptada_at?: string | null;
    nombre_plan?: string;
    descripcion?: string;
    periodicidad?: "mensual" | "anual" | "mensual_y_anual" | "pago_unico";
    incluye?: string[];
    beneficios?: string[];
  } | null;
  organizationName: string;
  logoUrl: string | null;
  accentColor: string;
  whatsappE164: string | null;
}

/** "La Equidad Seguros" → id de ConnectorIconTile, para mostrar el logo real cuando la aseguradora es una marca conocida. */
const KNOWN_INSURER_LOGOS: Record<string, string> = {
  "la equidad seguros": "la-equidad",
  "la equidad": "la-equidad"
};

const PERIODICIDAD_LABEL: Record<string, string> = {
  mensual: "Pago mensual",
  anual: "Pago anual",
  mensual_y_anual: "Mensual o anual",
  pago_unico: "Pago único"
};

function formatCop(value: number | null | undefined): string {
  if (value == null) return "Por confirmar";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return value;
  }
}

export default function CotizacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/cotizacion/${token}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      setQuote(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function aceptar() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/public/cotizacion/${token}/accept`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-2 px-6 text-center">
        <ShieldCheck className="w-8 h-8 text-gray-600" />
        <p className="text-sm text-gray-400">Este link de cotización no existe o ya no está disponible.</p>
      </div>
    );
  }

  const insurerKey = quote.resultado?.aseguradora?.trim().toLowerCase() ?? "";
  const insurerLogoId = KNOWN_INSURER_LOGOS[insurerKey];
  const accepted = Boolean(quote.resultado?.aceptada_at);
  const vigenciaDesde = formatDate(quote.resultado?.vigencia_desde);
  const vigenciaHasta = formatDate(quote.resultado?.vigencia_hasta);
  const periodicidad = quote.resultado?.periodicidad ?? (quote.resultado?.prima ? "mensual" : undefined);
  const incluye = quote.resultado?.incluye ?? [];
  const beneficios = quote.resultado?.beneficios ?? [];
  const hasDetails = Boolean(quote.resultado?.descripcion) || beneficios.length > 0;
  const waHref = quote.whatsappE164
    ? `https://wa.me/${quote.whatsappE164.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
        `Hola, tengo una pregunta sobre mi cotización de ${quote.ramoLabel.toLowerCase()}.`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {waHref && (
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/[.08] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {quote.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.logoUrl} alt={quote.organizationName} className="h-6 max-w-[120px] object-contain" />
            ) : (
              <p className="text-xs font-bold text-white truncate">{quote.organizationName}</p>
            )}
          </div>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        </div>
      )}

      <div className="flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          {!waHref && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {quote.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quote.logoUrl} alt={quote.organizationName} className="h-8 max-w-[160px] object-contain" />
              ) : (
                <p className="text-sm font-bold text-white">{quote.organizationName}</p>
              )}
            </div>
          )}

          <div
            className="rounded-3xl overflow-hidden shadow-2xl mt-6"
            style={{ border: `1.5px solid ${quote.accentColor}55`, backgroundColor: "rgba(255,255,255,0.03)" }}
          >
            <div className="p-6 text-center border-b border-white/[.08]">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{quote.ramoLabel}</p>
              <p className="text-sm text-gray-400">
                {quote.tomadorNombre ? `Cotización para ${quote.tomadorNombre}` : "Tu cotización está lista"}
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                {insurerLogoId ? (
                  <ConnectorIconTile id={insurerLogoId} size="lg" />
                ) : (
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${quote.accentColor}22` }}
                  >
                    <ShieldCheck className="w-6 h-6" style={{ color: quote.accentColor }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {quote.resultado?.aseguradora ?? "Aseguradora"}
                  </p>
                  {quote.resultado?.nombre_plan && (
                    <p className="text-xs text-gray-400 truncate">{quote.resultado.nombre_plan}</p>
                  )}
                  {(vigenciaDesde || vigenciaHasta) && (
                    <p className="text-[11px] text-gray-500">
                      Vigencia {vigenciaDesde ?? "—"} — {vigenciaHasta ?? "—"}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="rounded-2xl p-5 text-center"
                style={{ backgroundColor: `${quote.accentColor}14`, border: `1px solid ${quote.accentColor}33` }}
              >
                {periodicidad && <p className="text-xs font-medium mb-1" style={{ color: quote.accentColor }}>{PERIODICIDAD_LABEL[periodicidad]}</p>}
                <p className="text-3xl font-bold" style={{ color: quote.accentColor }}>
                  {formatCop(quote.resultado?.prima ?? quote.resultado?.prima_anual)}
                  <span className="text-sm font-normal text-gray-400">
                    {periodicidad === "anual" ? "/año" : periodicidad === "pago_unico" ? "" : "/mes"}
                  </span>
                </p>
                {periodicidad === "mensual_y_anual" && quote.resultado?.prima_anual != null && (
                  <p className="text-xs text-gray-500 mt-1">o {formatCop(quote.resultado.prima_anual)}/año</p>
                )}
              </div>

              {incluye.length > 0 && (
                <ul className="space-y-1.5">
                  {incluye.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: quote.accentColor }} /> {item}
                    </li>
                  ))}
                </ul>
              )}

              {hasDetails && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDetails(v => !v)}
                    className="w-full flex items-center justify-center gap-1 text-xs font-medium py-1"
                    style={{ color: quote.accentColor }}
                  >
                    {showDetails ? "Ver menos" : "Ver detalles"}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
                  </button>
                  {showDetails && (
                    <div className="pt-2 space-y-3 border-t border-white/[.06] mt-2">
                      {quote.resultado?.descripcion && (
                        <p className="text-xs text-gray-300">
                          <span className="font-semibold text-white">Nota: </span>
                          {quote.resultado.descripcion}
                        </p>
                      )}
                      {beneficios.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-white mb-1.5">Beneficios adicionales:</p>
                          <ul className="space-y-1">
                            {beneficios.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: quote.accentColor }} /> {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {accepted ? (
                <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Cotización aceptada — te contactaremos para el siguiente paso.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={aceptar}
                  disabled={accepting}
                  className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: quote.accentColor }}
                >
                  {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Aceptar cotización
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5 mt-5 text-center">
            <MessageCircle className="w-5 h-5 mx-auto mb-2" style={{ color: quote.accentColor }} />
            <p className="text-sm font-medium text-white">¿Necesitas asesoría personalizada?</p>
            <p className="text-xs text-gray-500 mt-1 mb-3">Estoy aquí para resolver todas tus dudas y ayudarte a elegir la mejor opción.</p>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: quote.accentColor }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Pregúntame
              </a>
            )}
          </div>

          <p className="text-center text-[11px] text-gray-600 mt-5">
            Cotización informativa, sujeta a confirmación final de la aseguradora.
          </p>
        </div>
      </div>
    </div>
  );
}
