"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Save, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";
import {
  DEFAULT_ORI_ORG_INSTRUCTIONS,
  ORI_ORG_INSTRUCCIONES_MAX,
  type OriExtension,
  type OriOrgInstructions,
  type OriTono
} from "@/types/ori-instructions";

const TONO_OPCIONES: { value: OriTono; label: string; hint: string }[] = [
  { value: "default", label: "Como venga", hint: "Ori elige según la conversación" },
  { value: "tu", label: "Tutear", hint: "Cercano, de tú" },
  { value: "usted", label: "Usted", hint: "Formal" }
];

const EXTENSION_OPCIONES: { value: OriExtension; label: string; hint: string }[] = [
  { value: "default", label: "Equilibrado", hint: "Como responde hoy" },
  { value: "breve", label: "Breve", hint: "Directo al punto" },
  { value: "detallada", label: "Detallado", hint: "Explica el porqué" }
];

const PLACEHOLDER = `Ejemplo:
- A nuestros productos les decimos "referencias", no "artículos".
- Cuando pregunten por un pedido, recuérdales confirmar la ciudad de despacho.
- No ofrezcas descuentos: eso lo autoriza siempre un asesor.`;

export default function OriInstruccionesPage() {
  const router = useRouter();
  const { can } = useOrgPermissions();
  const puedeEditar = can("company_context", "edit");

  const [config, setConfig] = useState<OriOrgInstructions | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/ori/instrucciones");
      if (res.status === 403) {
        setError("No tienes permiso para ver la configuración de Ori.");
        setConfig(DEFAULT_ORI_ORG_INSTRUCTIONS);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      setConfig(data.config as OriOrgInstructions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      setConfig(DEFAULT_ORI_ORG_INSTRUCTIONS);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (next: Partial<OriOrgInstructions>) => {
    setSaved(false);
    setConfig(c => (c ? { ...c, ...next } : c));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/ori/instrucciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrucciones: config.instrucciones,
          tono: config.tono,
          extension: config.extension,
          filas_por_consulta: config.filasPorConsulta
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setConfig(data.config as OriOrgInstructions);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const restantes = ORI_ORG_INSTRUCCIONES_MAX - config.instrucciones.length;

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push("/dashboard/ori")}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06] transition-colors"
          aria-label="Volver a Ori"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Sparkles className="w-5 h-5 text-[#0f7eff]" />
        <div>
          <h1 className="text-lg font-bold">Instrucciones de Ori</h1>
          <p className="text-xs text-gray-400">
            Ajustes de tu empresa. Se suman a la configuración base de Noova, no la reemplazan.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
          )}

          <Field
            label="Instrucciones para Ori"
            hint="Cómo debe hablar y qué reglas debe respetar con tu negocio. No hace falta repetir lo que ya sabe de tu empresa: eso vive en Contextos de marca."
          >
            <textarea
              value={config.instrucciones}
              onChange={e => patch({ instrucciones: e.target.value.slice(0, ORI_ORG_INSTRUCCIONES_MAX) })}
              readOnly={!puedeEditar}
              rows={10}
              placeholder={PLACEHOLDER}
              className="w-full bg-noova-surface border border-white/[.08] rounded-xl px-4 py-3 text-sm text-gray-100 leading-relaxed resize-y min-h-[200px] focus:outline-none focus:border-[#0f7eff]/40"
            />
            <p className={`mt-1.5 text-[11px] ${restantes < 100 ? "text-amber-400" : "text-gray-500"}`}>
              {restantes} caracteres disponibles
            </p>
          </Field>

          <Field label="Cómo te trata">
            <Options
              options={TONO_OPCIONES}
              value={config.tono}
              disabled={!puedeEditar}
              onChange={v => patch({ tono: v })}
            />
          </Field>

          <Field label="Largo de las respuestas">
            <Options
              options={EXTENSION_OPCIONES}
              value={config.extension}
              disabled={!puedeEditar}
              onChange={v => patch({ extension: v })}
            />
          </Field>

          <Field
            label="Resultados por consulta"
            hint="Cuántas filas trae Ori al consultar listados como inventario antes de mandarte al listado completo."
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                value={config.filasPorConsulta}
                disabled={!puedeEditar}
                onChange={e => patch({ filasPorConsulta: Number(e.target.value) })}
                className="flex-1 accent-[#0f7eff]"
              />
              <span className="w-10 text-sm font-semibold tabular-nums text-gray-200">{config.filasPorConsulta}</span>
            </div>
          </Field>

          {puedeEditar && (
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0f7eff] hover:bg-[#3392ff] text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Guardado
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Options<T extends string>({
  options,
  value,
  disabled,
  onChange
}: {
  options: { value: T; label: string; hint: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
            value === opt.value
              ? "border-[#0f7eff]/50 bg-[#0f7eff]/10"
              : "border-white/[.08] bg-noova-surface hover:border-white/20"
          }`}
        >
          <span className={`block text-sm font-semibold ${value === opt.value ? "text-[#99c9ff]" : "text-gray-200"}`}>
            {opt.label}
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5">{opt.hint}</span>
        </button>
      ))}
    </div>
  );
}
