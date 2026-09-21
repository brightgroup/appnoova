"use client";

import type { ReactNode } from "react";
import { ChevronRight, SquarePen } from "lucide-react";

/**
 * Primitivas del panel lateral de configuración de agentes (vista "Configurar
 * y probar"). Lista plana separada por divisores finos, sin tarjetas: cada
 * campo es una fila con su etiqueta, una ayuda opcional y su control.
 */
export function AgentSidebarField({
  label,
  hint,
  action,
  children,
  className = ""
}: {
  label: string;
  hint?: ReactNode;
  /** Control alineado a la derecha de la etiqueta (switch, botón de icono). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`py-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-[var(--nv-text-muted)]">{label}</span>
        {action}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
      {hint && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--nv-text-faint)]">{hint}</p>
      )}
    </div>
  );
}

/** Abre el editor de instrucciones a pantalla grande. El prompt no se edita
 *  en el panel lateral: ahí no cabe y se lee mal. */
export function AgentPromptButton({ onClick, hint }: { onClick: () => void; hint: string }) {
  return (
    <AgentSidebarField label="Instrucciones" hint={hint}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-lg bg-[var(--nv-bg-control)] px-2.5 py-2.5 text-[12.5px] font-medium text-[var(--nv-text)] transition-colors hover:bg-[var(--nv-bg-control-hover)]"
      >
        <SquarePen className="h-3.5 w-3.5 shrink-0 text-[var(--nv-text-faint)]" />
        Editar instrucciones
        <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--nv-text-faint)]" />
      </button>
    </AgentSidebarField>
  );
}

export function AgentSidebarSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : min;

  return (
    <AgentSidebarField label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safe}
          onInput={e => onChange(parseFloat(e.currentTarget.value))}
          className="nv-range flex-1 h-2 cursor-pointer rounded-full appearance-none"
        />
        <span className="w-9 text-right text-xs font-medium tabular-nums text-[var(--nv-text-muted)]">
          {safe.toFixed(2)}
        </span>
      </div>
      {hint && (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--nv-text-faint)]">{hint}</p>
      )}
    </AgentSidebarField>
  );
}
