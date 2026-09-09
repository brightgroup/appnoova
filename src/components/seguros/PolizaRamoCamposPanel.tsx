"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, accentFocus, registryTableEmpty } from "@/lib/brand-ui";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { PolizaCampoFieldType, PolizaRamoCampoRecord } from "@/lib/insurers/poliza-ramo-campos-db";

const FIELD_TYPES: { value: PolizaCampoFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista" },
  { value: "boolean", label: "Sí/No" }
];

/** Calcado de CrmPropertyConfigPanel.tsx — mismo patrón, distinto eje de scoping (organization_id + ramo_id en vez de user_id + entity_type). */
export function PolizaRamoCamposPanel({ ramoId }: { ramoId: string }) {
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
        options: fieldType === "select" ? options.split(",").map(s => s.trim()).filter(Boolean) : []
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
        <div className={registryTableEmpty}>Este ramo todavía no tiene campos personalizados.</div>
      ) : (
        <ul className="divide-y divide-white/[.06] rounded-xl border border-white/[.08]">
          {campos.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{c.label}</p>
                <p className="text-[11px] text-gray-500 font-mono">{c.fieldKey} · {c.fieldType}</p>
              </div>
              <button type="button" onClick={() => removeCampo(c.id)} disabled={saving} className={btnGhost}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
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
          {fieldType === "select" && (
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
