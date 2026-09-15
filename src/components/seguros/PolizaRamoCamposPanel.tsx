"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Sparkles, MessageSquareText, Rows3, Type as TypeIcon, ChevronRight } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, accentFocus, accentText, accentBorderMedium, accentBgSubtle, registryTableEmpty } from "@/lib/brand-ui";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { Switch } from "@/components/ui/Switch";
import type { PolizaCampoFieldType, PolizaCampoPresentacion, PolizaRamoCampoRecord } from "@/lib/insurers/poliza-ramo-campos-db";
import type { RamoCotizable } from "@/lib/insurers/ramos-cotizables";

const FIELD_TYPES: { value: PolizaCampoFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista (una opción)" },
  { value: "multiselect", label: "Lista (varias opciones)" },
  { value: "boolean", label: "Sí/No" }
];

const FIELD_TYPES_WITH_OPTIONS: PolizaCampoFieldType[] = ["select", "multiselect"];

const PRESENTACIONES: { value: PolizaCampoPresentacion; label: string }[] = [
  { value: "auto", label: "Automática" },
  { value: "botones", label: "Botones" },
  { value: "lista", label: "Lista" },
  { value: "texto", label: "Texto libre" }
];

/** Misma regla que guided-questions.ts (resolvePresentacion) — para que la vista previa nunca diga algo distinto de lo que de verdad va a mandar la IA por WhatsApp. */
function presentacionEfectiva(campo: Pick<PolizaRamoCampoRecord, "presentacion" | "options" | "fieldType">): Exclude<PolizaCampoPresentacion, "auto"> {
  if (campo.fieldType === "multiselect") return "texto";
  if (campo.presentacion !== "auto") return campo.presentacion;
  const n = campo.options.length;
  if (n >= 2 && n <= 3) return "botones";
  if (n >= 4 && n <= 10) return "lista";
  return "texto";
}

function PresentacionPreview({ campo }: { campo: PolizaRamoCampoRecord }) {
  const efectiva = presentacionEfectiva(campo);
  if (efectiva === "texto") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
        <TypeIcon className="w-3 h-3" />
        {campo.fieldType === "multiselect" ? "Texto — el cliente elige varias, dichas en la pregunta" : "Pregunta abierta en texto"}
      </span>
    );
  }
  const limite = efectiva === "botones" ? 20 : 24;
  const largas = campo.options.filter(o => o.length > limite);
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
        {efectiva === "botones" ? <MessageSquareText className="w-3 h-3" /> : <Rows3 className="w-3 h-3" />}
        {efectiva === "botones" ? "Botones" : "Lista"} · {campo.options.length} opciones
      </span>
      <div className="flex flex-wrap gap-1.5">
        {campo.options.map((o, i) => (
          <span
            key={i}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              o.length > limite ? `${accentBorderMedium} ${accentText} ${accentBgSubtle}` : "border-white/[.10] text-gray-300 bg-white/[.03]"
            }`}
            title={o.length > limite ? `WhatsApp la corta a ${limite} caracteres: "${o.slice(0, limite)}"` : undefined}
          >
            {o}
          </span>
        ))}
      </div>
      {largas.length > 0 && (
        <p className={`text-[11px] ${accentText}`}>
          {largas.length === 1 ? "Esta opción supera" : "Estas opciones superan"} el límite de {limite} caracteres de WhatsApp y se van a cortar.
        </p>
      )}
    </div>
  );
}

function PresentacionPill({ campo }: { campo: Pick<PolizaRamoCampoRecord, "presentacion" | "options" | "fieldType"> }) {
  const efectiva = presentacionEfectiva(campo);
  if (efectiva === "texto") {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border border-white/[.10] text-gray-400 bg-white/[.03] shrink-0">
        <TypeIcon className="w-3 h-3" /> Texto
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border ${accentBorderMedium} ${accentText} ${accentBgSubtle} shrink-0`}>
      {efectiva === "botones" ? <MessageSquareText className="w-3 h-3" /> : <Rows3 className="w-3 h-3" />}
      {efectiva === "botones" ? "Botones" : "Lista"}
    </span>
  );
}

interface CampoRowProps {
  campo: PolizaRamoCampoRecord;
  defaultOpen: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  saving: boolean;
}

/** Fila compacta y expandible — con pocos ramos cabía mostrar todo abierto, pero deja de ser cómodo apenas un ramo tiene más de 4-5 campos. */
function CampoRow({ campo, defaultOpen, onPatch, onRemove, saving }: CampoRowProps) {
  const [pregunta, setPregunta] = useState(campo.pregunta ?? "");
  const [ayuda, setAyuda] = useState(campo.ayuda ?? "");
  const [optionsText, setOptionsText] = useState(campo.options.join(", "));

  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-white/[.02]">
        <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform group-open:rotate-90" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{campo.label}</p>
          <p className="text-xs text-gray-500 truncate">{campo.pregunta ?? campo.label}</p>
        </div>
        <PresentacionPill campo={campo} />
        <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-white/[.10] text-gray-400 bg-white/[.03] shrink-0">
          {campo.requeridoCotizacion ? "Obligatorio" : "Opcional"}
        </span>
        <button
          type="button"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(campo.id);
          }}
          disabled={saving}
          className={btnGhost}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </summary>

      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/[.06]">
        <p className="text-[11px] text-gray-500 font-mono pt-3">{campo.fieldKey} · {campo.fieldType}</p>

        <div>
          <label className="text-[11px] text-gray-500 mb-1 block">Pregunta que hace la IA</label>
          <input
            value={pregunta}
            onChange={e => setPregunta(e.target.value)}
            onBlur={() => pregunta !== (campo.pregunta ?? "") && onPatch(campo.id, { pregunta: pregunta.trim() || null })}
            placeholder={campo.label}
            className={`w-full rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-sm ${accentFocus}`}
          />
        </div>

        {FIELD_TYPES_WITH_OPTIONS.includes(campo.fieldType) && (
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">Opciones (separadas por coma)</label>
            <input
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              onBlur={() => {
                const next = optionsText.split(",").map(s => s.trim()).filter(Boolean);
                if (next.join(",") !== campo.options.join(",")) onPatch(campo.id, { options: next });
              }}
              className={`w-full rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-sm ${accentFocus}`}
            />
          </div>
        )}

        <div>
          <label className="text-[11px] text-gray-500 mb-1 block">Ayuda si el cliente pregunta qué significa (opcional)</label>
          <input
            value={ayuda}
            onChange={e => setAyuda(e.target.value)}
            onBlur={() => ayuda !== (campo.ayuda ?? "") && onPatch(campo.id, { ayuda: ayuda.trim() || null })}
            className={`w-full rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-sm ${accentFocus}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">Presentación</span>
            <div className="w-36">
              <NoovaSelect
                value={campo.presentacion}
                onChange={v => onPatch(campo.id, { presentacion: v })}
                allowEmpty={false}
                options={PRESENTACIONES}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            <Switch checked={campo.requeridoCotizacion} onChange={v => onPatch(campo.id, { requerido_cotizacion: v })} />
            Obligatorio para cotizar
          </label>
        </div>

        <PresentacionPreview campo={campo} />
      </div>
    </details>
  );
}

interface PolizaRamoCamposPanelProps {
  ramoId: string;
  /** Clave interna del ramo (ver ramos-cotizables.ts) — solo cuando este panel edita las preguntas que hace la IA al cotizar; habilita "Cargar valores por defecto". */
  ramo?: RamoCotizable;
}

/** Calcado de CrmPropertyConfigPanel.tsx — mismo patrón, distinto eje de scoping (organization_id + ramo_id en vez de user_id + entity_type). */
export function PolizaRamoCamposPanel({ ramoId, ramo }: PolizaRamoCamposPanelProps) {
  const [campos, setCampos] = useState<PolizaRamoCampoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<PolizaCampoFieldType>("text");
  const [options, setOptions] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/ramo-campos?ramo_id=${ramoId}`, { headers });
    if (res.ok) setCampos((await res.json()).campos ?? []);
    setLoading(false);
  }, [ramoId]);

  useEffect(() => { void load(); }, [load]);

  async function addCampo() {
    if (!label.trim()) return;
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/ramo-campos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ramo_id: ramoId,
        label: label.trim(),
        field_type: fieldType,
        options: FIELD_TYPES_WITH_OPTIONS.includes(fieldType) ? options.split(",").map(s => s.trim()).filter(Boolean) : []
      })
    });
    if (res.ok) {
      setLabel("");
      setOptions("");
      await load();
    }
    setSaving(false);
  }

  async function removeCampo(id: string) {
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/ramo-campos/${id}`, { method: "DELETE", headers });
    if (res.ok) await load();
    setSaving(false);
  }

  async function patchCampo(id: string, patch: Record<string, unknown>) {
    // Optimista — el corredor edita varias preguntas seguidas y no debería esperar cada guardado.
    setCampos(prev =>
      prev.map(c => {
        if (c.id !== id) return c;
        const next = { ...c } as PolizaRamoCampoRecord;
        if ("pregunta" in patch) next.pregunta = patch.pregunta as string | null;
        if ("ayuda" in patch) next.ayuda = patch.ayuda as string | null;
        if ("options" in patch) next.options = patch.options as string[];
        if ("presentacion" in patch) next.presentacion = patch.presentacion as PolizaCampoPresentacion;
        if ("requerido_cotizacion" in patch) next.requeridoCotizacion = patch.requerido_cotizacion as boolean;
        return next;
      })
    );
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/ramo-campos/${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!res.ok) await load();
  }

  async function cargarDefaults() {
    if (!ramo) return;
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/ramo-campos/defaults", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ramo })
    });
    if (res.ok) await load();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando campos…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {campos.length === 0 ? (
        <div className={registryTableEmpty}>
          <p>Este ramo todavía no tiene campos personalizados.</p>
          {ramo && (
            <button type="button" onClick={cargarDefaults} disabled={saving} className={`${btnGhost} mt-3 inline-flex items-center gap-1.5`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Cargar las preguntas que la IA usa hoy
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            {campos.length} {campos.length === 1 ? "campo" : "campos"} · {campos.filter(c => c.requeridoCotizacion).length} obligatorios para cotizar
          </p>
          <div className="divide-y divide-white/[.06] rounded-xl border border-white/[.08] overflow-hidden">
            {campos.map(c => (
              <CampoRow key={c.id} campo={c} defaultOpen={false} onPatch={patchCampo} onRemove={removeCampo} saving={saving} />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 space-y-3">
        <p className="text-sm font-medium text-white">Agregar campo</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Nombre</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ej. Placa, Dirección del inmueble…"
              className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
            <NoovaSelect
              value={fieldType}
              onChange={v => setFieldType(v as PolizaCampoFieldType)}
              allowEmpty={false}
              options={FIELD_TYPES.map(t => ({ value: t.value, label: t.label }))}
            />
          </div>
          {FIELD_TYPES_WITH_OPTIONS.includes(fieldType) && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Opciones (separadas por coma)</label>
              <input
                value={options}
                onChange={e => setOptions(e.target.value)}
                placeholder="Nueva, Renovación, Endoso"
                className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
              />
            </div>
          )}
        </div>
        <button type="button" onClick={addCampo} disabled={saving || !label.trim()} className={btnPrimary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Agregar</>}
        </button>
      </div>
    </div>
  );
}
