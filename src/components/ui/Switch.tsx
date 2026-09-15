"use client";

import type { ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  className?: string;
}

/** Interruptor genérico — mismo look que el switch online/offline del Inbox (role="switch" + aria-checked, sin CSS propio: hereda los colores ya definidos en globals.css para [role="switch"]). */
export function Switch({ checked, onChange, disabled, label, className = "" }: SwitchProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-[#0f7eff]" : "bg-white/10"
      } ${label ? "" : className}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );

  if (!label) return toggle;

  return (
    <label className={`inline-flex items-center gap-2.5 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}>
      {label}
      {toggle}
    </label>
  );
}
