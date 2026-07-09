import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Sistema unificado de "avisos" (caja informativa: label + título/texto).
 * A propósito NO es una pastilla — es una tarjeta con barra de acento a la
 * izquierda, para que nunca se confunda visualmente con un `Badge`.
 *
 * Dos layouts:
 * - "stack" (por defecto): caja compacta, label arriba, texto debajo. Para
 *   paneles laterales de configuración (ej. "Motor", "Plantilla base").
 * - "row": banner horizontal, texto a la izquierda + acción opcional a la
 *   derecha (ej. guía de prompt + botón "Restaurar plantilla").
 */

export type InfoBoxVariant = "neutral" | "accent" | "success" | "warning" | "danger";

const VARIANT_STYLES: Record<InfoBoxVariant, { border: string; bg: string; label: string; icon: string }> = {
  neutral: {
    border: "border-white/[.14]",
    bg: "bg-white/[.03]",
    label: "text-gray-400",
    icon: "text-gray-400",
  },
  accent: {
    border: "border-[#5b5bf6]/40",
    bg: "bg-[#5b5bf6]/[.07]",
    label: "text-[#a5a5ff]",
    icon: "text-[#a5a5ff]",
  },
  success: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/[.07]",
    label: "text-emerald-300",
    icon: "text-emerald-300",
  },
  warning: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/[.07]",
    label: "text-amber-300",
    icon: "text-amber-300",
  },
  danger: {
    border: "border-red-500/40",
    bg: "bg-red-500/[.07]",
    label: "text-red-300",
    icon: "text-red-300",
  },
};

interface InfoBoxProps {
  label?: string;
  title?: string;
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: InfoBoxVariant;
  action?: ReactNode;
  layout?: "stack" | "row";
  className?: string;
}

export function InfoBox({
  label,
  title,
  children,
  icon: Icon,
  variant = "neutral",
  action,
  layout = "stack",
  className = "",
}: InfoBoxProps) {
  const v = VARIANT_STYLES[variant];
  const shell = `rounded-xl border border-l-[3px] ${v.border} ${v.bg}`;

  if (layout === "row") {
    return (
      <div className={`${shell} flex items-start gap-3 px-4 py-3 ${className}`}>
        {Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${v.icon}`} />}
        <div className="min-w-0 flex-1">
          {label && (
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${v.label}`}>{label}</p>
          )}
          {title && <p className="mb-0.5 text-xs font-medium text-white">{title}</p>}
          {children && <div className="text-[11px] leading-relaxed text-gray-400">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div className={`${shell} p-3 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5">
        {Icon && <Icon className={`h-3 w-3 shrink-0 ${v.icon}`} />}
        {label && <p className={`text-[10px] font-semibold uppercase tracking-wide ${v.label}`}>{label}</p>}
      </div>
      {title && <p className="text-xs font-medium text-white">{title}</p>}
      {children && <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{children}</div>}
    </div>
  );
}
