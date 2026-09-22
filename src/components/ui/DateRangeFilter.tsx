"use client";

import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { nvControl } from "@/lib/brand-ui";
import {
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangePreset,
  type DateRangeValue
} from "@/lib/date-range-filter";

const dateInputClass = `${nvControl} w-full px-2.5 py-2 text-xs [color-scheme:dark] focus:outline-none focus:border-[#0f7eff]/50`;

/**
 * Selector de rango de fechas para los popovers de filtro (Inbox y CRM).
 * Solo muestra los campos de fecha cuando el preset es "Personalizado".
 */
export function DateRangeFilter({
  value,
  onChange,
  label = "Fecha"
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  label?: string;
}) {
  const setPreset = (preset: DateRangePreset) => {
    onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" });
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      <NoovaSelect
        value={value.preset}
        onChange={v => setPreset(v as DateRangePreset)}
        options={DATE_RANGE_PRESET_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        allowEmpty={false}
        searchable={false}
      />
      {value.preset === "custom" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Desde</span>
            <input
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={e => onChange({ ...value, from: e.target.value })}
              className={dateInputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Hasta</span>
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={e => onChange({ ...value, to: e.target.value })}
              className={dateInputClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}
