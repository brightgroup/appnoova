import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Etiquetas de estado/categoría — planas, sin borde, fondo oscuro + texto
 * claro del mismo tono (estilo "Offline": minimalista, sin glow).
 *
 * No confundir con `InfoBox` (avisos con barra lateral y más texto).
 */

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "emerald"
  | "violet"
  | "sky"
  | "amber"
  | "orange"
  | "blue"
  | "danger";

export type BadgeSize = "sm" | "md";

/** Fondo oscuro + texto suave del mismo matiz — sin borde ni sombra. */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-white/[.08] text-gray-400",
  accent: "bg-[#072b55]/60 text-[#2f8fff]",
  emerald: "bg-emerald-950/60 text-emerald-400",
  violet: "bg-violet-950/60 text-violet-300",
  sky: "bg-sky-950/60 text-sky-300",
  amber: "bg-amber-950/60 text-amber-300",
  orange: "bg-orange-950/60 text-orange-300",
  blue: "bg-blue-950/60 text-blue-300",
  danger: "bg-red-950/70 text-red-300",
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

const ICON_SIZE: Record<BadgeSize, string> = {
  sm: "w-3 h-3",
  md: "w-3.5 h-3.5",
};

interface BadgeOwnProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  uppercase?: boolean;
  className?: string;
}

export type BadgeProps = BadgeOwnProps &
  Omit<ComponentPropsWithoutRef<"span">, keyof BadgeOwnProps>;

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  icon: Icon,
  uppercase = false,
  className = "",
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={[
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border-0 font-medium leading-snug",
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        uppercase ? "uppercase tracking-wide" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {Icon && <Icon className={`${ICON_SIZE[size]} shrink-0 opacity-90`} />}
      {children}
    </span>
  );
}
