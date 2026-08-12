/** Categorías del gráfico de consumo — alineadas con CREDIT_COST en pricing.ts */

export const BILLING_CHART_CATEGORIES = [
  { key: "ori",          label: "ORI",             color: "#5b5bf6", events: ["ori"] as const },
  { key: "milink",       label: "Mi Link",         color: "#818cf8", events: ["milink", "widget", "text_test"] as const },
  { key: "whatsapp",     label: "WhatsApp",        color: "#22c55e", events: ["whatsapp_ai", "whatsapp_manual", "whatsapp_media_ai"] as const },
  { key: "voz",          label: "Agentes de Voz",  color: "#c084fc", events: ["voice"] as const },
  { key: "documentos",   label: "Documentos",      color: "#006e80", events: ["doc_scan"] as const },
  { key: "formularios",  label: "Formularios",     color: "#06b6d4", events: ["form_fill"] as const },
  { key: "cotizaciones", label: "Cotizaciones",    color: "#ec4899", events: ["quote"] as const },
] as const;

export type BillingChartKey = (typeof BILLING_CHART_CATEGORIES)[number]["key"];

export type BillingChartDay = {
  dateKey: string;
  dayStr: string;
  dayLabel: string;
} & Record<BillingChartKey, number>;

export function createEmptyChartDay(date: Date): BillingChartDay {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateKey = `${date.getFullYear()}-${mm}-${dd}`;
  return {
    dateKey,
    dayStr: `${mm}/${dd}`,
    dayLabel: date.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }),
    ori: 0,
    milink: 0,
    whatsapp: 0,
    voz: 0,
    documentos: 0,
    formularios: 0,
    cotizaciones: 0,
  };
}

export function chartKeyForEvent(eventType: string): BillingChartKey | null {
  for (const cat of BILLING_CHART_CATEGORIES) {
    if ((cat.events as readonly string[]).includes(eventType)) return cat.key;
  }
  return null;
}

export function dayTotal(day: BillingChartDay): number {
  return BILLING_CHART_CATEGORIES.reduce((sum, c) => sum + day[c.key], 0);
}

/** Escala legible para el eje X (evita que pocos créditos llenen toda la barra). */
export function niceChartScaleMax(rawMax: number, minFloor = 500): number {
  const n = Math.max(rawMax, minFloor);
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const normalized = n / magnitude;
  const nice =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 2.5 ? 2.5 :
    normalized <= 5 ? 5 :
    10;
  return nice * magnitude;
}

export function chartAxisTicks(scaleMax: number, segments = 4): number[] {
  const step = scaleMax / segments;
  return Array.from({ length: segments + 1 }, (_, i) => Math.round(step * i));
}

export const USAGE_TYPE_LABELS: Record<string, string> = {
  ori: "ORI",
  milink: "Mi Link",
  widget: "Mi Link",
  text_test: "Mi Link",
  whatsapp_ai: "WhatsApp",
  whatsapp_manual: "WhatsApp",
  whatsapp_media_ai: "WhatsApp — Imagen/PDF",
  voice: "Agentes de Voz",
  doc_scan: "Documentos",
  form_fill: "Formularios",
  quote: "Cotizaciones",
};
