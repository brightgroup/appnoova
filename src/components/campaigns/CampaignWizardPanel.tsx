"use client";

import { btnPrimary } from "@/lib/brand-ui";

interface WizardPanelProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function CampaignWizardPanel({ title, description, children }: WizardPanelProps) {
  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <aside className="w-[min(100%,300px)] shrink-0 border-r border-white/[.06] p-6 hidden md:flex flex-col">
        <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
        <p className="text-sm text-gray-500 mt-3 leading-relaxed">{description}</p>
      </aside>
      <div className="flex-1 min-w-0 overflow-y-auto p-6 md:p-8">
        <div className="md:hidden mb-6">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{description}</p>
        </div>
        <div className="max-w-2xl">{children}</div>
      </div>
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
      <label className="text-sm font-medium text-gray-200">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function CampaignInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.10] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#5b5bf6]/50 focus:ring-1 focus:ring-[#5b5bf6]/30 transition-colors ${props.className ?? ""}`}
    />
  );
}

export function CampaignTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.10] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#5b5bf6]/50 focus:ring-1 focus:ring-[#5b5bf6]/30 transition-colors resize-y min-h-[100px] ${props.className ?? ""}`}
    />
  );
}

export function CampaignSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.10] text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50 focus:ring-1 focus:ring-[#5b5bf6]/30 transition-colors ${props.className ?? ""}`}
    />
  );
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
