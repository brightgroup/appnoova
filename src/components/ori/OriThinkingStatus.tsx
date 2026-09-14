"use client";

import { useEffect, useState } from "react";

const WORDS = ["Pensando", "Revisando los datos", "Cotizando"];

function labelForSecond(s: number): string {
  if (s < 2) return WORDS[0];
  if (s < 4) return WORDS[1];
  if (s < 6) return WORDS[2];
  return "Aún pensando";
}

/**
 * "Pensando… 4s" con las palabras cambiando cada par de segundos y "Aún
 * pensando" después de 6s — mismo espíritu que el indicador de Claude
 * mientras trabaja. El contador es un intervalo real, no decorativo: no
 * sabemos cuánto va a tardar la respuesta de Ori (el endpoint no transmite
 * en streaming todavía), así que esto es lo más honesto que podemos mostrar.
 */
export function OriThinkingStatus({ className = "" }: { className?: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const id = window.setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`flex items-baseline gap-1.5 text-xs text-gray-500 ${className}`}>
      <span>{labelForSecond(seconds)}…</span>
      <span className="text-gray-600 tabular-nums">{seconds}s</span>
    </div>
  );
}
