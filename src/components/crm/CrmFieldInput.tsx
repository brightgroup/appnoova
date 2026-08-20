import type { CrmPropertyDefinition, CrmPropertyFieldType } from "@/types/crm";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { CrmToggleChip } from "@/components/crm/CrmToggleChip";

const inputClass =
  "w-full rounded-xl border border-white/[.12] bg-noova-surface px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/45 focus:ring-1 focus:ring-[#0f7eff]/20 transition-colors";

interface CrmFieldInputProps {
  definition: Pick<CrmPropertyDefinition, "field_key" | "label" | "field_type" | "options" | "is_required">;
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number | boolean | null) => void;
  disabled?: boolean;
}

export function CrmFieldInput({ definition, value, onChange, disabled }: CrmFieldInputProps) {
  const strVal = value == null ? "" : String(value);
  const type = definition.field_type as CrmPropertyFieldType;

  if (type === "boolean") {
    return (
      <CrmToggleChip
        checked={Boolean(value)}
        onChange={v => onChange(v)}
        label={definition.label}
        tone="neutral"
        disabled={disabled}
      />
    );
  }

  if (type === "textarea") {
    return (
      <div>
        <label className="text-xs text-gray-400 mb-1 block">{definition.label}</label>
        <textarea
          value={strVal}
          disabled={disabled}
          required={definition.is_required}
          rows={3}
          onChange={e => onChange(e.target.value || null)}
          className={`${inputClass} resize-y min-h-[80px]`}
        />
      </div>
    );
  }

  if (type === "select") {
    return (
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">{definition.label}</label>
        <NoovaSelect
          value={strVal}
          disabled={disabled}
          onChange={v => onChange(v || null)}
          options={definition.options.map(opt => ({ value: opt, label: opt }))}
        />
      </div>
    );
  }

  const htmlType =
    type === "email" ? "email"
    : type === "phone" ? "tel"
    : type === "number" ? "number"
    : type === "date" ? "date"
    : type === "url" ? "url"
    : "text";

  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{definition.label}</label>
      <input
        type={htmlType}
        value={strVal}
        disabled={disabled}
        required={definition.is_required}
        onChange={e => {
          const v = e.target.value;
          if (type === "number") onChange(v === "" ? null : Number(v));
          else onChange(v || null);
        }}
        className={`${inputClass}${type === "phone" ? " font-mono" : ""}`}
      />
    </div>
  );
}

export function formatCrmDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
