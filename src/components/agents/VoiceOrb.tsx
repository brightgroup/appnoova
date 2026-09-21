"use client";

/**
 * Esfera de color por voz, al estilo de los avatares de voz de ElevenLabs.
 * La paleta se deriva del id de la voz, así cada voz conserva siempre el
 * mismo color sin necesidad de mantener un mapa a mano.
 */

const PALETTES: readonly (readonly [string, string, string])[] = [
  ["#ff5f8f", "#ffd36b", "#7c6bff"],
  ["#35c6ff", "#5b7bff", "#8ef0ff"],
  ["#5effa8", "#35e0c0", "#c8ff6b"],
  ["#b06bff", "#ff6bd6", "#6b8cff"],
  ["#ffb86b", "#ff6b6b", "#ffe66b"],
  ["#7cf1ff", "#7c6bff", "#ff8ad8"]
];

function paletteFor(seed: string): readonly [string, string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length];
}

export function VoiceOrb({
  seed,
  size = 18,
  className = ""
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const [c1, c2, c3] = paletteFor(seed || "noova");

  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 220deg, ${c1}, ${c2}, ${c3}, ${c1})`,
        boxShadow:
          "inset -2px -3px 5px rgba(0,0,0,.45), inset 2px 2px 3px rgba(255,255,255,.5), 0 1px 2px rgba(0,0,0,.3)"
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          top: size * 0.13,
          left: size * 0.24,
          width: size * 0.32,
          height: size * 0.26,
          background: "radial-gradient(circle, rgba(255,255,255,.95), rgba(255,255,255,0) 72%)"
        }}
      />
    </span>
  );
}
