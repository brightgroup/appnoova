import type { CrmPropertyDefinition, CrmPropertyFieldType } from "@/types/crm";
import { accentFocus } from "@/lib/brand-ui";

const inputClass = `w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 ${accentFocus}`;

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
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="rounded border-white/20"
        />
        {definition.label}
      </label>
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
        <label className="text-xs text-gray-400 mb-1 block">{definition.label}</label>
        <select
          value={strVal}
          disabled={disabled}
          required={definition.is_required}
          onChange={e => onChange(e.target.value || null)}
          className={inputClass}
        >
          <option value="">—</option>
          {definition.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
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
