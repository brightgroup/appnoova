"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileEdit, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, modalInput } from "@/lib/brand-ui";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { OriAnimatedIcon } from "@/components/icons/OriAnimatedIcon";
import { PlateBadge } from "@/components/crm/PlateBadge";
import { RamoCampoInput, type RamoCampo } from "@/components/crm/RamoCampoInput";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { QuoteResultPeriodicidad } from "@/lib/insurers/quote-requests-db";

interface QuoteDetail {
  id: string;
  ramo: string;
  placa: string | null;
  vehiculo: { marca?: string; linea?: string; modelo?: number };
  tomador: {
    nombre_tomador?: string;
    documento_tomador?: string;
    fecha_nacimiento_tomador?: string;
    ocupacion?: string;
    ciudad?: string;
  };
  estado: "pendiente" | "cotizada" | "enviada_externa" | "cerrada" | "descartada";
  leadId: string | null;
}

interface Guidance {
  step: "sin_cotizacion" | "cotizar_automatico" | "registrar_manual" | "generar_pdf" | "cerrada";
  message: string;
  quote: QuoteDetail | null;
  ramoCampos: RamoCampo[];
  leadTitle: string | null;
}

const RAMO_LABEL: Record<string, string> = { autos: "Auto", vida: "Vida", hogar: "Hogar", salud: "Salud" };
const TOMADOR_FIELDS: Array<{ key: keyof QuoteDetail["tomador"]; label: string; type: RamoCampo["fieldType"] }> = [
  { key: "nombre_tomador", label: "Nombre completo", type: "text" },
  { key: "documento_tomador", label: "Documento", type: "text" },
  { key: "fecha_nacimiento_tomador", label: "Fecha de nacimiento", type: "date" },
  { key: "ocupacion", label: "Ocupación", type: "text" },
  { key: "ciudad", label: "Ciudad", type: "text" }
];
const PERIODICIDAD_OPCIONES: Array<{ value: QuoteResultPeriodicidad; label: string }> = [
  { value: "mensual", label: "Solo mensual" },
  { value: "anual", label: "Solo anual" },
  { value: "mensual_y_anual", label: "Mensual y anual" },
  { value: "pago_unico", label: "Pago único" }
];

interface ResultadoDraft {
  aseguradora: string;
  nombre_plan: string;
  descripcion: string;
  periodicidad: QuoteResultPeriodicidad;
  precio_mensual: string;
  precio_anual: string;
  incluye: string[];
  beneficios: string;
}

function emptyDraft(): ResultadoDraft {
  return { aseguradora: "", nombre_plan: "", descripcion: "", periodicidad: "mensual", precio_mensual: "", precio_anual: "", incluye: [], beneficios: "" };
}

function SolicitudFichaContent({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [accion, setAccion] = useState<"manual" | null>(null);
  const [resultado, setResultado] = useState<ResultadoDraft>(emptyDraft());
  const [nuevaCaracteristica, setNuevaCaracteristica] = useState("");
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/cotizaciones/${quoteId}`, { headers });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setError(data?.error || "Solicitud no encontrada");
      setLoading(false);
      return;
    }
    // Ya tiene resultado — esta ficha es solo para solicitudes en curso, la cotización ya
    // realizada vive en /dashboard/crm/cotizaciones (ver plan "Solicitudes independientes").
    if (data.quote && data.quote.estado !== "pendiente") {
      setRedirecting(true);
      window.location.replace(`/dashboard/crm/cotizaciones/${quoteId}`);
      return;
    }
    setGuidance(data);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const quote = guidance?.quote ?? null;

  async function saveTomador(key: string, value: unknown) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/cotizaciones/${quoteId}/datos-riesgo`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ tomador: { [key]: value } })
    });
    await load();
  }

  async function saveRamoCampo(fieldKey: string, value: unknown) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/cotizaciones/${quoteId}/datos-riesgo`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ campos: { [fieldKey]: value } })
    });
    await load();
  }

  function addCaracteristica() {
    if (!nuevaCaracteristica.trim()) return;
    setResultado(r => ({ ...r, incluye: [...r.incluye, nuevaCaracteristica.trim()] }));
    setNuevaCaracteristica("");
  }

  function removeCaracteristica(i: number) {
    setResultado(r => ({ ...r, incluye: r.incluye.filter((_, idx) => idx !== i) }));
  }

  function handleCotizarConOri() {
    router.push(`/dashboard/ori?quote_id=${quoteId}`);
  }

  async function guardarResultado() {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${quoteId}/registrar-manual`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          aseguradora: resultado.aseguradora.trim() || undefined,
          nombre_plan: resultado.nombre_plan.trim() || undefined,
          descripcion: resultado.descripcion.trim() || undefined,
          periodicidad: resultado.periodicidad,
          prima: resultado.precio_mensual ? Number(resultado.precio_mensual) : undefined,
          prima_anual: resultado.precio_anual ? Number(resultado.precio_anual) : undefined,
          incluye: resultado.incluye,
          beneficios: resultado.beneficios.split("\n").map(b => b.trim()).filter(Boolean)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el resultado");
        return;
      }
      // Ya tiene resultado — pasa a ser una cotización, no una solicitud.
      window.location.href = `/dashboard/crm/cotizaciones/${quoteId}`;
    } finally {
      setSaving(false);
    }
  }

  async function solicitarAutomatico() {
    setActing(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/cotizaciones/${quoteId}/cotizar`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cotizar");
        return;
      }
      window.location.href = `/dashboard/crm/cotizaciones/${quoteId}`;
    } finally {
      setActing(false);
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
      backHref={quote?.leadId ? `/dashboard/crm/leads/${quote.leadId}` : "/dashboard/crm/solicitudes"}
      title={quote ? `Seguro de ${RAMO_LABEL[quote.ramo] ?? quote.ramo}` : "Solicitud"}
      subtitle={[guidance?.leadTitle, quote?.tomador?.nombre_tomador].filter(Boolean).join(" · ") || undefined}
      loading={loading}
      error={error}
      wide
    >
      {quote && guidance && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-full bg-white/[.06] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  Seguro de {RAMO_LABEL[quote.ramo] ?? quote.ramo}
                  {quote.tomador.nombre_tomador ? ` — ${quote.tomador.nombre_tomador}` : ""}
                </p>
                <p className="text-[11px] text-amber-300/90">Reuniendo datos</p>
              </div>
              {quote.placa && <PlateBadge plate={quote.placa} className="ml-auto" />}
            </div>

            <div className="divide-y divide-white/[.05]">
              {quote.ramo === "autos" && (quote.vehiculo?.marca || quote.vehiculo?.linea) && (
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-gray-500 shrink-0">Vehículo</span>
                  <span className="text-xs text-gray-200 truncate">
                    {[quote.vehiculo?.marca, quote.vehiculo?.linea, quote.vehiculo?.modelo].filter(Boolean).join(" ")}
                  </span>
                </div>
              )}
              {TOMADOR_FIELDS.map(f => (
                <RamoCampoInput
                  key={f.key}
                  campo={{ fieldKey: f.key, label: f.label, fieldType: f.type, options: [], value: quote.tomador[f.key] ?? null }}
                  onSave={saveTomador}
                />
              ))}
              {guidance.ramoCampos.map(campo => (
                <RamoCampoInput key={campo.fieldKey} campo={campo} onSave={saveRamoCampo} />
              ))}
            </div>

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

            {guidance.step === "cotizar_automatico" ? (
              <button
                type="button"
                onClick={solicitarAutomatico}
                disabled={acting}
                className={`${btnPrimary} !text-xs !py-2 gap-1.5 mt-4`}
              >
                {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Solicitar cotización real
              </button>
            ) : (
              <div className="flex items-center justify-center gap-8 mt-5 pt-5 border-t border-white/[.06]">
                <button type="button" onClick={() => setAccion(accion === "manual" ? null : "manual")} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      accion === "manual" ? "bg-[#0f7eff]" : "bg-white/[.06] hover:bg-white/[.1]"
                    }`}
                  >
                    <FileEdit className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] text-gray-400">Cotización manual</span>
                </button>
                <button type="button" onClick={handleCotizarConOri} className="flex flex-col items-center gap-1.5">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-[#0f7eff] to-[#3392ff] opacity-90 hover:opacity-100 transition-opacity">
                    <OriAnimatedIcon state="idle" variant="solid" className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] text-gray-400">Cotizar con ORI</span>
                </button>
              </div>
            )}
          </div>

          {accion === "manual" && (
            <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
              <p className="text-sm font-semibold text-white mb-4">Resultado de la cotización</p>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Aseguradora</label>
                    <input
                      value={resultado.aseguradora}
                      onChange={e => setResultado(r => ({ ...r, aseguradora: e.target.value }))}
                      placeholder="Ej. Sura"
                      className={`${modalInput} !text-sm w-full`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nombre del plan</label>
                    <input
                      value={resultado.nombre_plan}
                      onChange={e => setResultado(r => ({ ...r, nombre_plan: e.target.value }))}
                      placeholder="Ej. Protección Familiar Plus"
                      className={`${modalInput} !text-sm w-full`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Descripción del plan</label>
                  <textarea
                    value={resultado.descripcion}
                    onChange={e => setResultado(r => ({ ...r, descripcion: e.target.value }))}
                    rows={2}
                    placeholder="Nota breve para el cliente…"
                    className={`${modalInput} !text-sm w-full resize-none`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Frecuencia de pago</label>
                    <NoovaSelect
                      value={resultado.periodicidad}
                      onChange={v => setResultado(r => ({ ...r, periodicidad: v as QuoteResultPeriodicidad }))}
                      options={PERIODICIDAD_OPCIONES}
                      allowEmpty={false}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Precio mensual</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={resultado.precio_mensual}
                      onChange={e => setResultado(r => ({ ...r, precio_mensual: e.target.value.replace(/[^\d]/g, "") }))}
                      placeholder="$ 0"
                      className={`${modalInput} !text-sm w-full`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Precio anual</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={resultado.precio_anual}
                      onChange={e => setResultado(r => ({ ...r, precio_anual: e.target.value.replace(/[^\d]/g, "") }))}
                      placeholder="$ 0"
                      className={`${modalInput} !text-sm w-full`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Características del plan</label>
                  <div className="space-y-1.5 mb-2">
                    {resultado.incluye.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-gray-300 py-1.5 px-3 rounded-lg bg-black/20 border border-white/[.06]">{item}</span>
                        <button type="button" onClick={() => removeCaracteristica(i)} className="text-gray-500 hover:text-red-400 p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={nuevaCaracteristica}
                      onChange={e => setNuevaCaracteristica(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCaracteristica())}
                      placeholder="Ej. Cobertura médica $5.000.000"
                      className={`${modalInput} !text-xs flex-1`}
                    />
                    <button type="button" onClick={addCaracteristica} className={`${btnGhost} !text-xs !py-1.5 gap-1`}>
                      <Plus className="w-3.5 h-3.5" /> Agregar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Beneficios adicionales</label>
                  <textarea
                    value={resultado.beneficios}
                    onChange={e => setResultado(r => ({ ...r, beneficios: e.target.value }))}
                    rows={3}
                    placeholder={"Un beneficio por línea…"}
                    className={`${modalInput} !text-sm w-full resize-none`}
                  />
                </div>

                <button
                  type="button"
                  onClick={guardarResultado}
                  disabled={saving || (!resultado.precio_mensual && !resultado.precio_anual)}
                  className={`${btnPrimary} !text-xs !py-2 gap-1.5`}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Guardar resultado
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </CrmDetailLayout>
  );
}

export default function SolicitudFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <SolicitudFichaContent quoteId={id} />
    </Suspense>
  );
}
