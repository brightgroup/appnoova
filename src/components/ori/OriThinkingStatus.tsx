"use client";

import { useEffect, useState } from "react";

const WORDS = [
  "Pensando",
  "Trabajando para ti",
  "Revisando tu información",
  "Un momento más",
  "Ya casi",
  "Aún por aquí",
];

function labelForSecond(s: number): string {
  return WORDS[Math.floor(s / 2) % WORDS.length];
}

/**
 * "Pensando… 4s" con las palabras rotando cada par de segundos en bucle —
 * mismo espíritu que el indicador de Claude mientras trabaja. Son frases
 * puramente decorativas, no pasos reales: el endpoint no transmite en
 * streaming todavía, así que no sabemos qué está haciendo Ori en cada
 * instante y sería deshonesto nombrar una acción específica (ej. "Cotizando")
 * que puede no corresponder a lo que en verdad está pasando. El contador de
 * segundos sí es real.
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
