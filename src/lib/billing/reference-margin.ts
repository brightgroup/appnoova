import type { UsageEventType } from "@/lib/billing/pricing-types";

/** Perfil de uso típico por evento (referencia interna para margen en admin). */
interface ReferenceUsageProfile {
  twilioMessages?: number;
  voiceMinutes?: number;
  voicePremium?: boolean;
  geminiModel?: "flash" | "pro";
  promptTokens?: number;
  completionTokens?: number;
}

const REFERENCE_USAGE: Record<UsageEventType, ReferenceUsageProfile> = {
  ori: { geminiModel: "flash", promptTokens: 450, completionTokens: 280 },
  milink: { geminiModel: "flash", promptTokens: 650, completionTokens: 420 },
  widget: { geminiModel: "flash", promptTokens: 650, completionTokens: 420 },
  text_test: { geminiModel: "flash", promptTokens: 400, completionTokens: 250 },
  whatsapp_manual: { twilioMessages: 1 },
  whatsapp_ai: { twilioMessages: 2, geminiModel: "flash", promptTokens: 900, completionTokens: 650 },
  // Referencia con Gemini Flash (el caso típico); con Claude Sonnet el costo real
  // es ~8x más por token — cubierto aparte por el piso de margen dinámico en recordUsage.
  whatsapp_media_ai: { geminiModel: "flash", promptTokens: 1600, completionTokens: 250 },
  // Esquema con anidamiento moderado (ej. varios comprobantes con monto/fecha/banco) —
  // la salida es JSON compacto, más liviana que una respuesta conversacional.
  automation_extract: { geminiModel: "flash", promptTokens: 1000, completionTokens: 400 },
  // Sin componente de costo real — la API de HubSpot no cobra por llamada (a diferencia de
  // Twilio/Meta o los modelos LLM), así que no hay desglose de costo de proveedor que mostrar.
  hubspot_greeting: {},
  voice: { voiceMinutes: 1 },
  voice_premium: { voiceMinutes: 1, voicePremium: true },
  voice_voicemail: { voiceMinutes: 0.05, voicePremium: true },
  voice_no_answer: { voiceMinutes: 0.03 },
  doc_scan: { geminiModel: "pro", promptTokens: 2200, completionTokens: 1600 },
  form_fill: { geminiModel: "flash", promptTokens: 1100, completionTokens: 850 },
  quote: { geminiModel: "pro", promptTokens: 1600, completionTokens: 1300 },
};

function geminiCostFromRates(
  model: "flash" | "pro",
  promptTokens: number,
  completionTokens: number,
  rates: Record<string, number>
): number {
  const inputKey = model === "pro" ? "gemini_pro_input_per_m" : "gemini_flash_input_per_m";
  const outputKey = model === "pro" ? "gemini_pro_output_per_m" : "gemini_flash_output_per_m";
  const inputRate = rates[inputKey] ?? 0;
  const outputRate = rates[outputKey] ?? 0;
  return (promptTokens / 1_000_000) * inputRate + (completionTokens / 1_000_000) * outputRate;
}

export interface ReferenceCostLine {
  label: string;
  usd: number;
}

/** Desglose legible del costo estimado (para admin). */
export function referenceCostBreakdown(
  eventType: UsageEventType,
  rates: Record<string, number>
): ReferenceCostLine[] {
  const profile = REFERENCE_USAGE[eventType];
  if (!profile) return [];

  const lines: ReferenceCostLine[] = [];

  if (profile.twilioMessages) {
    const rate = rates.twilio_wa_per_msg ?? 0;
    lines.push({
      label: `Twilio × ${profile.twilioMessages} msg`,
      usd: profile.twilioMessages * rate,
    });
  }

  if (profile.voiceMinutes) {
    const key = profile.voicePremium ? "voice_premium_per_min" : "voice_standard_per_min";
    const rate = rates[key] ?? 0;
    lines.push({
      label: profile.voicePremium ? "ElevenLabs + Telnyx (1 min)" : "Telnyx + Gemini (1 min)",
      usd: profile.voiceMinutes * rate,
    });
  }

  if (profile.geminiModel && profile.promptTokens && profile.completionTokens) {
    const modelLabel = profile.geminiModel === "pro" ? "Gemini Pro" : "Gemini Flash";
    lines.push({
      label: `${modelLabel} (~${formatTokens(profile.promptTokens)} in + ${formatTokens(profile.completionTokens)} out)`,
      usd: geminiCostFromRates(
        profile.geminiModel,
        profile.promptTokens,
        profile.completionTokens,
        rates
      ),
    });
  }

  return lines;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

export function referenceProviderCostUsd(
  eventType: UsageEventType,
  rates: Record<string, number>
): number {
  return referenceCostBreakdown(eventType, rates).reduce((sum, line) => sum + line.usd, 0);
}

export function referenceMarginPct(priceUsd: number, providerCostUsd: number): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (!Number.isFinite(providerCostUsd) || providerCostUsd <= 0) return null;
  return Math.round(((priceUsd - providerCostUsd) / priceUsd) * 100);
}
