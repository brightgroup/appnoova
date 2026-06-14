"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, accentFocus, registryTableEmpty } from "@/lib/brand-ui";
import { slugifyPropertyKey } from "@/lib/crm-record";
import type { CrmPropertyDefinition, CrmPropertyEntity, CrmPropertyFieldType } from "@/types/crm";

const FIELD_TYPES: { value: CrmPropertyFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "boolean", label: "Sí/No" }
];

interface CrmPropertyConfigPanelProps {
  entityType: CrmPropertyEntity;
  onUpdated?: () => void;
}

export function CrmPropertyConfigPanel({ entityType, onUpdated }: CrmPropertyConfigPanelProps) {
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CrmPropertyFieldType>("text");
  const [options, setOptions] = useState("");
  const [groupName, setGroupName] = useState("Personalizado");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/properties?entity=${entityType}`, { headers });
    const data = await res.json();
    if (res.ok) setProperties(data.properties ?? []);
    setLoading(false);
  }, [entityType]);

  useEffect(() => { load(); }, [load]);

  const addProperty = async () => {
    if (!label.trim()) return;
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/properties", {
      method: "POST",
      headers,
      body: JSON.stringify({
        entity_type: entityType,
        label: label.trim(),
        field_key: slugifyPropertyKey(label),
        field_type: fieldType,
        group_name: groupName.trim() || "Personalizado",
        options: fieldType === "select"
          ? options.split(",").map(s => s.trim()).filter(Boolean)
          : []
      })
    });
    if (res.ok) {
      setLabel("");
      setOptions("");
      await load();
      onUpdated?.();
    }
    setSaving(false);
  };

  const removeCustom = async (id: string) => {
    const prop = properties.find(p => p.id === id);
    if (!prop || prop.is_builtin) return;
    const remaining = properties.filter(p => !p.is_builtin && p.id !== id);
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/properties", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        entity_type: entityType,
        properties: remaining.map((p, i) => ({
          field_key: p.field_key,
          label: p.label,
          field_type: p.field_type,
          options: p.options,
          group_name: p.group_name,
          sort_order: i
        }))
      })
    });
    if (res.ok) {
      await load();
      onUpdated?.();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando propiedades…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {properties.length === 0 ? (
        <div className={registryTableEmpty}>No hay propiedades configuradas.</div>
      ) : (
        <ul className="divide-y divide-white/[.06] rounded-xl border border-white/[.08]">
          {properties.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {p.label}
                  {p.is_builtin && (
                    <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase">Predeterminado</span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500 font-mono">{p.field_key} · {p.field_type}</p>
              </div>
              {!p.is_builtin && (
                <button type="button" onClick={() => removeCustom(p.id)} disabled={saving} className={btnGhost}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 space-y-3">
        <p className="text-sm font-medium text-white">Agregar propiedad</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Nombre</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ej. Ciudad, Segmento…"
              className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
            <select
              value={fieldType}
              onChange={e => setFieldType(e.target.value as CrmPropertyFieldType)}
              className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
            >
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Grupo</label>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
            />
          </div>
          {fieldType === "select" && (
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Opciones (separadas por coma)</label>
              <input
                value={options}
                onChange={e => setOptions(e.target.value)}
                placeholder="Alta, Media, Baja"
                className={`w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm ${accentFocus}`}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={addProperty}
          disabled={saving || !label.trim()}
          className={btnPrimary}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Agregar</>}
        </button>
      </div>
    </div>
  );
}
