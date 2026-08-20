"use client";

import { btnPrimary } from "@/lib/brand-ui";

interface WizardPanelProps {
  children: React.ReactNode;
}

export function CampaignWizardPanel({ children }: WizardPanelProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8">
      <div className="max-w-3xl mx-auto w-full">{children}</div>
    </div>
  );
}

export function CampaignFieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="text-xs text-gray-400">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && !required && <span className="text-gray-600 ml-1">({hint})</span>}
      </label>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#0f7eff]/50 transition-colors";

export function CampaignInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function CampaignTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${fieldClass} resize-y min-h-[88px] ${props.className ?? ""}`}
    />
  );
}

export function CampaignSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function CampaignContinueButton({
  onClick,
  disabled,
  loading,
  label = "Guardar y continuar",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`${btnPrimary} px-6 py-2.5 disabled:opacity-50`}
    >
      {loading ? "Guardando…" : label}
    </button>
  );
}
