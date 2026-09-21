// Marca de ElevenLabs — su isotipo son dos barras verticales. Monocromo a
// propósito (hereda currentColor), como la marca real, para que funcione
// igual sobre fondo claro y oscuro.
import type { SVGProps } from "react";

export function ElevenLabsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <title>ElevenLabs</title>
      <rect x="6.5" y="3.5" width="3.6" height="17" />
      <rect x="13.9" y="3.5" width="3.6" height="17" />
    </svg>
  );
}
