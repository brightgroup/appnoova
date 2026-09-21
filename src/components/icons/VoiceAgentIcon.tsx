"use client";

import type { SVGProps } from "react";
import { RING_PATH } from "@/components/icons/OriAnimatedIcon";

/**
 * Ícono de los agentes de voz. Comparte la silueta de Ori —misma cara y las
 * mismas orejas— para que se lean como de la misma familia, pero en lugar de
 * ojos lleva un ecualizador y no lleva antena: es un agente que escucha y
 * habla, no el copiloto.
 */
export function VoiceAgentIcon({
  variant = "solid",
  ...props
}: SVGProps<SVGSVGElement> & {
  /** "solid" = azul de marca fijo. "badge" = blanco, para ir sobre un fondo azul. */
  variant?: "solid" | "badge";
}) {
  const fill = variant === "badge" ? "#fff" : "#0f7eff";

  return (
    <svg viewBox="0 0 200 200" {...props}>
      <title>Agente de voz</title>
      <g fill={fill}>
        <path fillRule="evenodd" d={RING_PATH} />
        {/* orejas, como las de Ori */}
        <rect x="10" y="94" width="17" height="40" rx="8.5" />
        <rect x="173" y="94" width="17" height="40" rx="8.5" />
        {/* ecualizador: la voz en vez de la mirada */}
        <rect x="64" y="97" width="16" height="30" rx="8" />
        <rect x="92" y="80" width="16" height="64" rx="8" />
        <rect x="120" y="97" width="16" height="30" rx="8" />
      </g>
    </svg>
  );
}
