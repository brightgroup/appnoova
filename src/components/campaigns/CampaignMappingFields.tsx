"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import type { CampaignFieldMapping } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import { CampaignInput, CampaignSelect } from "@/components/campaigns/CampaignWizardPanel";
import { slugifyVariableKey } from "@/lib/campaigns/render-prompt";

interface CampaignMappingFieldsProps {
  campaignId?: string;
  mapping: CampaignFieldMapping;
  columns: DataTableColumn[];
  triggerNeedsDate: boolean;
  onChange: (mapping: CampaignFieldMapping) => void;
  sampleRows?: Record<string, string | number | boolean | null>[];
}

function formatPreviewCell(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function VariableChip({ token }: { token: string }) {
  return (
    <span className="text-[11px] px-2 py-1 rounded-md border border-[#5b5bf6]/25 bg-[#5b5bf6]/8 text-[#a5a5ff] font-mono">
      {`{{${token}}}`}
    </span>
  );
}

export function CampaignMappingFields({
  campaignId,
  mapping,
  columns,
  triggerNeedsDate,
  onChange,
  sampleRows,
}: CampaignMappingFieldsProps) {
  const [autoMapping, setAutoMapping] = useState(false);

  const runAutoMap = async () => {
    if (campaignId) {
      setAutoMapping(true);
      const res = await authFetch(`/api/campaigns/${campaignId}/auto-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      const json = await res.json();
      setAutoMapping(false);
      if (res.ok && json.mapping) {
        onChange({
          phone_column: json.mapping.phone_column ?? "",
          name_column: json.mapping.name_column ?? "",
          call_date_column: json.mapping.call_date_column,
          custom_fields: mapping.custom_fields,
        });
      }
      return;
    }

    const { autoMapCampaignColumnsFromSchema } = await import("@/lib/campaigns/column-mapping");
    const next = autoMapCampaignColumnsFromSchema(columns, triggerNeedsDate);
    onChange({ ...next, custom_fields: mapping.custom_fields });
  };

  const addCustomField = () => {
    const unused = columns.find(
      c =>
        c.key !== mapping.phone_column &&
        c.key !== mapping.name_column &&
        c.key !== mapping.call_date_column &&
        !mapping.custom_fields.some(f => f.column_key === c.key)
    );
    if (!unused) return;
    onChange({
      ...mapping,
      custom_fields: [
        ...mapping.custom_fields,
        { label: unused.label, column_key: unused.key },
      ],
    });
  };

  const updateCustom = (index: number, columnKey: string) => {
    const col = columns.find(c => c.key === columnKey);
    const next = [...mapping.custom_fields];
    next[index] = { label: col?.label ?? columnKey, column_key: columnKey };
    onChange({ ...mapping, custom_fields: next });
  };

  const removeCustom = (index: number) => {
    onChange({
      ...mapping,
      custom_fields: mapping.custom_fields.filter((_, i) => i !== index),
    });
  };

  const labelForKey = (key: string) => columns.find(c => c.key === key)?.label ?? key;

  if (columns.length === 0) return null;

  const requiredRows = [
    { key: "phone" as const, label: "Teléfono", value: mapping.phone_column, required: true },
    { key: "name" as const, label: "Nombre", value: mapping.name_column, required: true },
    ...(triggerNeedsDate
      ? [{ key: "date" as const, label: "Fecha de llamada", value: mapping.call_date_column ?? "", required: false }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Columnas clave detectadas</p>
        <button
          type="button"
          onClick={() => void runAutoMap()}
          disabled={autoMapping}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#a5a5ff] hover:bg-[#5b5bf6]/10 disabled:opacity-40"
        >
          {autoMapping ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Auto-mapear
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {requiredRows.map(row => (
          <div
            key={row.key}
            className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2.5"
          >
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{row.label}</p>
            <p
              className={`text-sm font-medium mt-0.5 truncate ${
                row.value ? "text-emerald-400" : row.required ? "text-red-400" : "text-amber-400"
              }`}
            >
              {row.value ? labelForKey(row.value) : row.required ? "Sin asignar" : "Opcional"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/[.08] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[.08] bg-white/[.02]">
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 w-[34%]">
                Campo Noova
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Columna del archivo
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 w-[30%]">
                Variable
              </th>
            </tr>
          </thead>
          <tbody>
            {requiredRows.map(row => (
              <tr key={row.key} className="border-b border-white/[.04] last:border-0">
                <td className="px-3 py-2.5 text-sm text-gray-300 align-middle">
                  {row.label}
                  {row.required && <span className="text-red-400 ml-0.5">*</span>}
                </td>
                <td className="px-3 py-2 align-middle">
                  <CampaignSelect
                    value={row.value}
                    onChange={e => {
                      const v = e.target.value;
                      if (row.key === "phone") onChange({ ...mapping, phone_column: v });
                      else if (row.key === "name") onChange({ ...mapping, name_column: v });
                      else onChange({ ...mapping, call_date_column: v || null });
                    }}
                    className="py-1.5 text-xs"
                  >
                    <option value="">Seleccionar…</option>
                    {columns.map(c => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </CampaignSelect>
                </td>
                <td className="px-3 py-2 align-middle">
                  {row.key === "phone" ? (
                    <VariableChip token="telefono" />
                  ) : row.key === "name" ? (
                    <VariableChip token="nombre" />
                  ) : (
                    <span className="text-[11px] text-gray-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {mapping.custom_fields.map((field, i) => (
              <tr key={`custom-${i}`} className="border-b border-white/[.04] last:border-0">
                <td className="px-3 py-2 align-middle">
                  <CampaignInput
                    value={field.label}
                    onChange={e => {
                      const next = [...mapping.custom_fields];
                      next[i] = { ...next[i], label: e.target.value };
                      onChange({ ...mapping, custom_fields: next });
                    }}
                    placeholder="Etiqueta"
                    className="py-1.5 text-xs"
                  />
                </td>
                <td className="px-3 py-2 align-middle">
                  <CampaignSelect
                    value={field.column_key}
                    onChange={e => updateCustom(i, e.target.value)}
                    className="py-1.5 text-xs"
                  >
                    <option value="">Columna…</option>
                    {columns.map(c => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </CampaignSelect>
                </td>
                <td className="px-3 py-2 align-middle">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center flex-1 min-w-0 rounded-md border border-[#5b5bf6]/25 bg-[#5b5bf6]/8 px-2 py-1.5 focus-within:border-[#5b5bf6]/50">
                      <span className="text-[#a5a5ff]/60 text-xs font-mono shrink-0">{"{{"}</span>
                      <input
                        value={field.variable_key ?? slugifyVariableKey(field.label || field.column_key)}
                        onChange={e => {
                          const next = [...mapping.custom_fields];
                          next[i] = { ...next[i], variable_key: slugifyVariableKey(e.target.value) };
                          onChange({ ...mapping, custom_fields: next });
                        }}
                        className="w-full min-w-0 bg-transparent px-0.5 text-xs text-[#a5a5ff] font-mono focus:outline-none"
                      />
                      <span className="text-[#a5a5ff]/60 text-xs font-mono shrink-0">{"}}"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustom(i)}
                      className="p-1.5 text-gray-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addCustomField}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#a5a5ff] hover:text-white"
      >
        <Plus className="w-3.5 h-3.5" /> Agregar campo
      </button>

      {sampleRows && sampleRows.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">Vista previa (primeras filas)</p>
          <div className="overflow-x-auto rounded-lg border border-white/[.08] max-h-40 overflow-y-auto">
            <table className="w-full text-xs min-w-max">
              <thead className="sticky top-0 bg-noova-surface">
                <tr className="border-b border-white/[.08]">
                  {columns.map(c => (
                    <th
                      key={c.key}
                      className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-white/[.04] last:border-0">
                    {columns.map(c => (
                      <td
                        key={c.key}
                        className="px-2 py-1.5 text-gray-300 whitespace-nowrap max-w-[160px] truncate"
                      >
                        {formatPreviewCell(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {columns.map(c => {
          const mapped =
            c.key === mapping.phone_column ||
            c.key === mapping.name_column ||
            c.key === mapping.call_date_column;
          return (
            <span
              key={c.key}
              className={`text-[10px] px-2 py-1 rounded-full border ${
                mapped
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/[.08] bg-white/[.03] text-gray-400"
              }`}
            >
              {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
