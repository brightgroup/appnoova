"use client";

import { Check } from "lucide-react";

type Tone = "neutral" | "danger" | "success";

const toneActive: Record<Tone, string> = {
  neutral: "border-[#0f7eff]/35 bg-[#0f7eff]/10 text-[#2f8fff]",
  danger: "border-red-500/35 bg-red-500/10 text-red-300",
  success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
};

const toneCheck: Record<Tone, string> = {
  neutral: "bg-[#0f7eff] border-[#0f7eff]",
  danger: "bg-red-500 border-red-500",
  success: "bg-emerald-500 border-emerald-500"
};

interface CrmToggleChipProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  tone?: Tone;
  disabled?: boolean;
}

export function CrmToggleChip({
  checked,
  onChange,
  label,
  description,
  tone = "neutral",
  disabled
}: CrmToggleChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm transition-all ${
        checked
          ? toneActive[tone]
          : "border-white/[.08] bg-white/[.02] text-gray-400 hover:border-white/[.14] hover:bg-white/[.04] hover:text-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`mt-0.5 w-4 h-4 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
          checked ? toneCheck[tone] : "border-white/20 bg-white/[.04]"
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{label}</span>
        {description && (
          <span className="block text-xs mt-0.5 opacity-70 leading-snug">{description}</span>
        )}
      </span>
    </button>
  );
}
