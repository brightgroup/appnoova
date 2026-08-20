// Marca de Google Gemini — path data de Simple Icons (CC0), con el degradé de
// marca (varias instancias en una misma página necesitan cada una su propio
// id de gradiente, por eso useId en vez de un id fijo).
import { useId, type SVGProps } from "react";

export function GeminiLogo(props: SVGProps<SVGSVGElement>) {
  const gradientId = `gemini-gradient-${useId()}`;
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <title>Gemini</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4893fc" />
          <stop offset="0.27" stopColor="#4893fc" />
          <stop offset="0.78" stopColor="#969dff" />
          <stop offset="1" stopColor="#e07dff" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </svg>
  );
}
