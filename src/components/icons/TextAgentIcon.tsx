"use client";

import type { SVGProps } from "react";
import { RING_PATH } from "@/components/icons/OriAnimatedIcon";

/**
 * Ícono de los agentes de texto. Misma cara y mismas orejas que Ori y que el
 * agente de voz, pero por dentro lleva los tres puntos de un chat escribiendo.
 * La antena queda reservada para Ori: los agentes son de la familia, no el
 * copiloto.
 */
export function TextAgentIcon({
  variant = "solid",
  ...props
}: SVGProps<SVGSVGElement> & {
  /** "solid" = azul de marca fijo. "badge" = blanco, para ir sobre un fondo azul. */
  variant?: "solid" | "badge";
}) {
  const fill = variant === "badge" ? "#fff" : "#0f7eff";

  return (
    <svg viewBox="0 0 200 200" {...props}>
      <title>Agente de texto</title>
      <g fill={fill}>
        <path fillRule="evenodd" d={RING_PATH} />
        <rect x="10" y="94" width="17" height="40" rx="8.5" />
        <rect x="173" y="94" width="17" height="40" rx="8.5" />
        {/* los tres puntos de "escribiendo…" */}
        <circle cx="71" cy="112" r="11" />
        <circle cx="100" cy="112" r="11" />
        <circle cx="129" cy="112" r="11" />
      </g>
    </svg>
  );
}
