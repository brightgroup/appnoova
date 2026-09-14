"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Plus, ShieldCheck } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";
import { PlateBadge } from "@/components/crm/PlateBadge";
import { RamoCampoInput, type RamoCampo } from "@/components/crm/RamoCampoInput";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { RAMOS_COTIZABLES } from "@/lib/insurers/ramos-cotizables";

interface QuoteTomador {
  nombre_tomador?: string;
  documento_tomador?: string;
  fecha_nacimiento_tomador?: string;
  ocupacion?: string;
  ciudad?: string;
}

interface QuoteRequestSummary {
  id: string;
  ramo: string;
  placa: string | null;
  tomador: QuoteTomador;
  estado: string;
}

interface Guidance {
  step: "sin_cotizacion" | "cotizar_automatico" | "registrar_manual" | "generar_pdf" | "cerrada";
  message: string;
  quote: QuoteRequestSummary | null;
  ramoCampos: RamoCampo[];
}

const RAMO_LABEL: Record<string, string> = { autos: "Auto", vida: "Vida", hogar: "Hogar", salud: "Salud" };
const TOMADOR_FIELDS: Array<{ key: keyof QuoteTomador; label: string; type: RamoCampo["fieldType"] }> = [
  { key: "nombre_tomador", label: "Nombre completo", type: "text" },
  { key: "documento_tomador", label: "Documento", type: "text" },
  { key: "fecha_nacimiento_tomador", label: "Fecha de nacimiento", type: "date" },
  { key: "ocupacion", label: "Ocupación", type: "text" },
  { key: "ciudad", label: "Ciudad", type: "text" }
];
const NUEVA_COTIZACION_OPCIONES = (Object.keys(RAMOS_COTIZABLES) as Array<keyof typeof RAMOS_COTIZABLES>).map(key => ({
  value: key,
  label: RAMOS_COTIZABLES[key].label
}));

/**
 * Datos que la IA (o el asesor) reúne para poder cotizar un seguro — viven en
 * el lead, no en una entidad de cotización aparte (decisión explícita: "no
 * vale la pena tener una entidad completa solo con los datos por ramo").
 * Se muestran sutiles (texto + lápiz para editar), agrupados por ramo activo.
 * Una vez completos, el asesor pasa a registrar el resultado real en la ficha
 * de la cotización (que ahí sí es su propia entidad, ver LeadCotizacionCard).
 */
export function LeadRamoDatosCard({ leadId }: { leadId: string }) {
  const [guidances, setGuidances] = useState<Guidance[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoRamo, setNuevoRamo] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${leadId}/seguro-cotizacion`, { headers });
    const data = await res.json().catch(() => null);
    if (res.ok && data) setGuidances(data.guidances ?? []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function guardarTomador(quoteId: string, key: string, value: unknown) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/cotizaciones/${quoteId}/datos-riesgo`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ tomador: { [key]: value } })
    });
    await load();
  }

  async function guardarCampo(quoteId: string, fieldKey: string, value: unknown) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/cotizaciones/${quoteId}/datos-riesgo`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ campos: { [fieldKey]: value } })
    });
    await load();
  }

  async function agregarRamo() {
    if (!nuevoRamo) return;
    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/crm/leads/${leadId}/seguro-cotizacion`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ramo: nuevoRamo })
      });
      setNuevoRamo("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-4 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando datos de cotización…
      </div>
    );
  }

  const pendientes = guidances.filter(g => g.quote && (g.step === "cotizar_automatico" || g.step === "registrar_manual"));

  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
        <p className="text-sm font-semibold text-white">Datos para cotizar</p>
      </div>

      {pendientes.length === 0 && (
        <p className="text-xs text-gray-500 mb-3">Todavía no hay datos en curso — agrega un ramo para empezar.</p>
      )}

      <div className="space-y-4">
        {pendientes.map(g => {
          const quote = g.quote!;
          return (
            <div key={quote.id} className="pt-3 first:pt-0 border-t border-white/[.06] first:border-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-white">Seguro de {RAMO_LABEL[quote.ramo] ?? quote.ramo}</span>
                  {quote.placa && <PlateBadge plate={quote.placa} />}
                </div>
                <a
                  href={`/dashboard/crm/solicitudes/${quote.id}`}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[#99c9ff] hover:text-white"
                >
                  Registrar cotización <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <div className="divide-y divide-white/[.04]">
                {TOMADOR_FIELDS.map(f => (
                  <RamoCampoInput
                    key={f.key}
                    campo={{ fieldKey: f.key, label: f.label, fieldType: f.type, options: [], value: quote.tomador[f.key] ?? null }}
                    onSave={(_, value) => guardarTomador(quote.id, f.key, value)}
                  />
                ))}
                {g.ramoCampos.map(campo => (
                  <RamoCampoInput key={campo.fieldKey} campo={campo} onSave={(fieldKey, value) => guardarCampo(quote.id, fieldKey, value)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[.06]">
        <NoovaSelect
          value={nuevoRamo}
          onChange={setNuevoRamo}
          options={NUEVA_COTIZACION_OPCIONES}
          placeholder="Elegir ramo…"
          className="!py-1.5 !text-xs flex-1"
        />
        <button
          type="button"
          onClick={agregarRamo}
          disabled={!nuevoRamo || creating}
          className={`${btnPrimary} !text-xs !py-1.5 gap-1.5 shrink-0`}
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Agregar ramo
        </button>
      </div>
    </div>
  );
}
