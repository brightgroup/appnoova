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
      return "bg-emerald-500/20 text-emerald-400";
    case "Mejorando":
      return "bg-blue-500/20 text-blue-400";
    default:
      return "bg-amber-500/20 text-amber-400";
  }
}
