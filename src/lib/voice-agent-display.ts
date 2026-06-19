import { tagNeonAmber, tagNeonBlue, tagNeonEmerald } from "@/lib/brand-ui";

const AGENT_COLOR_GRADIENTS: Record<string, [string, string]> = {
  "from-[#1d4ed8] to-[#38bdf8]": ["#1d4ed8", "#38bdf8"],
  "from-[#0369a1] to-[#00eaff]": ["#0369a1", "#00eaff"],
  "from-[#1e40af] to-[#67e8f9]": ["#1e40af", "#67e8f9"],
  // legacy → azul corporativo + neón
  "from-[#7c3dff] to-[#e040fb]": ["#1d4ed8", "#38bdf8"],
  "from-[#5b5bf6] to-[#7070f8]": ["#1d4ed8", "#38bdf8"],
  "from-[#00eaff] to-[#2979ff]": ["#0369a1", "#00eaff"],
  "from-cyan-500 to-blue-600": ["#0369a1", "#00eaff"],
  "from-blue-500 to-indigo-600": ["#1e40af", "#67e8f9"],
  "from-[#ff2d95] to-[#ff6b2c]": ["#1e40af", "#67e8f9"]
};

const DEFAULT_AVATAR_COLORS: [string, string] = ["#1d4ed8", "#38bdf8"];

function resolveAvatarColors(colorClass: string | null | undefined): [string, string] {
  const key = colorClass?.trim() || "from-[#1d4ed8] to-[#38bdf8]";
  return AGENT_COLOR_GRADIENTS[key] ?? DEFAULT_AVATAR_COLORS;
}

/** Gradiente CSS para avatar (evita clases Tailwind dinámicas que no compilan). */
export function agentAvatarGradient(colorClass: string | null | undefined): string {
  const [from, to] = resolveAvatarColors(colorClass);
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

/** Estilo completo del avatar con brillo neón. */
export function agentAvatarStyle(colorClass: string | null | undefined): {
  background: string;
  boxShadow: string;
} {
  const [from, to] = resolveAvatarColors(colorClass);
  return {
    background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
    boxShadow: `0 0 22px ${from}aa, 0 0 44px ${to}66, inset 0 1px 0 rgba(255,255,255,0.3)`
  };
}

/** Etiqueta de calidad según volumen de llamadas de prueba/real. */
export function deriveQualityLabel(callsCount: number): string {
  if (callsCount >= 50) return "Estable";
  if (callsCount >= 10) return "Mejorando";
  return "Aprendiendo";
}

export function formatCostUsd(amount: number): string {
  return `US$ ${Number(amount || 0).toFixed(2)}`;
}

export function formatCostPerResult(costUsd: number, goals: number): string {
  if (goals <= 0) return "-";
  return formatCostUsd(costUsd / goals);
}

export function formatContactedLine(contacted: number, contacts: number): string {
  const pct = contacts > 0 ? (contacted / contacts) * 100 : 0;
  return `${contacted} (${pct.toFixed(1)}%)`;
}

export function qualityBadgeClass(label: string): string {
  switch (label) {
    case "Estable":
      return tagNeonEmerald;
    case "Mejorando":
      return tagNeonBlue;
    default:
      return tagNeonAmber;
  }
}