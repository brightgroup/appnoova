"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import type { CampaignFieldMapping } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import {
  CampaignFieldLabel,
  CampaignInput,
  CampaignSelect,
  CampaignWizardPanel,
} from "@/components/campaigns/CampaignWizardPanel";

interface CampaignStepMappingProps {
  campaignId: string;
  mapping: CampaignFieldMapping;
  columns: DataTableColumn[];
  triggerNeedsDate: boolean;
  onChange: (mapping: CampaignFieldMapping) => void;
}

export function CampaignStepMapping({
  campaignId,
  mapping,
  columns,
  triggerNeedsDate,
  onChange,
}: CampaignStepMappingProps) {
  const [autoMapping, setAutoMapping] = useState(false);

  const columnOptions = columns.map(c => c.label);

  const runAutoMap = async () => {
    setAutoMapping(true);
    const res = await authFetch(`/api/campaigns/${campaignId}/auto-map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column_labels: columnOptions }),
    });
    const json = await res.json();
    setAutoMapping(false);
    if (res.ok && json.mapping) {
      onChange({
        phone_column: json.mapping.phone_column ?? "",
        name_column: json.mapping.name_column ?? "",
        call_date_column: json.mapping.call_date_column,
        custom_fields: json.mapping.custom_fields ?? [],
      });
    }
  };

  const addCustomField = () => {
    const unused = columnOptions.find(
      l =>
        l !== mapping.phone_column &&
        l !== mapping.name_column &&
        l !== mapping.call_date_column &&
        !mapping.custom_fields.some(f => f.column_key === l)
    );
    if (!unused) return;
    onChange({
      ...mapping,
      custom_fields: [...mapping.custom_fields, { label: unused, column_key: unused }],
    });
  };

  const updateCustom = (index: number, column_key: string) => {
    const next = [...mapping.custom_fields];
    next[index] = { label: column_key, column_key };
    onChange({ ...mapping, custom_fields: next });
  };

  const removeCustom = (index: number) => {
    onChange({
      ...mapping,
      custom_fields: mapping.custom_fields.filter((_, i) => i !== index),
    });
  };

  return (
    <CampaignWizardPanel
      title="Mapeo de propiedades"
      description="Relaciona las columnas de tu archivo con los campos de la campaña. Teléfono y nombre son obligatorios."
    >
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void runAutoMap()}
            disabled={autoMapping || columnOptions.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#5b5bf6]/30 text-[#a5a5ff] hover:bg-[#5b5bf6]/10 disabled:opacity-40"
          >
            {autoMapping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Auto-mapear
          </button>
        </div>

        <div className="rounded-xl border border-white/[.08] overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-white/[.06] text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-2">
            <span>Campo Noova</span>
            <span>Columna en tu archivo</span>
          </div>

          <div className="divide-y divide-white/[.06]">
            <MappingRow
              label="Teléfono"
              required
              value={mapping.phone_column}
              options={columnOptions}
              onChange={v => onChange({ ...mapping, phone_column: v })}
            />
            <MappingRow
              label="Nombre de contacto"
              required
              value={mapping.name_column}
              options={columnOptions}
              onChange={v => onChange({ ...mapping, name_column: v })}
            />
            {triggerNeedsDate && (
              <MappingRow
                label="Fecha de llamada"
                hint="Para programar cada contacto"
                value={mapping.call_date_column ?? ""}
                options={columnOptions}
                onChange={v => onChange({ ...mapping, call_date_column: v || null })}
              />
            )}
            {mapping.custom_fields.map((field, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center px-4 py-3">
                <CampaignInput
                  value={field.label}
                  onChange={e => updateCustom(i, e.target.value)}
                  placeholder="Etiqueta"
                  className="py-2"
                />
                <CampaignSelect
                  value={field.column_key}
                  onChange={e => updateCustom(i, e.target.value)}
                >
                  <option value="">Columna…</option>
                  {columnOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </CampaignSelect>
                <button
                  type="button"
                  onClick={() => removeCustom(i)}
                  className="p-2 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={addCustomField}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a5a5ff] hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar campo personalizado
        </button>
      </div>
    </CampaignWizardPanel>
  );
}

function MappingRow({
  label,
  required,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 items-center px-4 py-3">
      <div>
        <CampaignFieldLabel label={label} required={required} hint={hint} />
      </div>
      <CampaignSelect value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Seleccionar columna…</option>
        {options.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </CampaignSelect>
    </div>
  );
}
