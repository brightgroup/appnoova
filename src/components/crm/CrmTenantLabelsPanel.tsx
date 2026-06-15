"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";
import { DEFAULT_TENANT_LABELS } from "@/lib/crm-labels";
import type { CrmTenantLabelKey, CrmTenantLabels } from "@/types/crm";

const LABEL_KEYS: { key: CrmTenantLabelKey; hint: string }[] = [
  { key: "producto_servicio", hint: "Ej. Póliza, Producto, Membresía" },
  { key: "categoria_interes", hint: "Ej. Ramo, Categoría, Especialidad" },
  { key: "asesor_asignado", hint: "Ej. Asesor, Responsable, Vendedor" }
];

export function CrmTenantLabelsPanel() {
  const [labels, setLabels] = useState<CrmTenantLabels>(DEFAULT_TENANT_LABELS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/labels", { headers });
    const data = await res.json();
    if (res.ok) setLabels(data.labels ?? DEFAULT_TENANT_LABELS);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const headers = await getAuthHeaders();
    await fetch("/api/crm/labels", {
      method: "PUT",
      headers,
      body: JSON.stringify({ labels })
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando labels…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Personaliza cómo se muestran ciertos campos en la ficha de contacto según tu nicho.
      </p>
      {LABEL_KEYS.map(({ key, hint }) => (
        <div key={key}>
          <label className="text-xs text-gray-400 mb-1 block font-mono">{key}</label>
          <input
            value={labels[key]}
            onChange={e => setLabels(l => ({ ...l, [key]: e.target.value }))}
            placeholder={hint}
            className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm"
          />
        </div>
      ))}
      <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Guardar labels</>}
      </button>
    </div>
  );
}
