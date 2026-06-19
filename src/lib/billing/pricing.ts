/**
 * Precios y costos de facturación.
 * Créditos = pesos colombianos (1 crédito = $1 COP).
 * Fuente comercial: docs/PRICING.md
 */

/** TRM de referencia USD → COP (para reportes de costo/margen). */
export const TRM_COP = 4200;

/** Tipos de evento facturable. */
export type UsageEventType =
  | "ori"
  | "milink"
  | "widget"
  | "text_test"
  | "whatsapp_ai"
  | "whatsapp_manual"
  | "voice"
  | "doc_scan"
  | "form_fill"
  | "quote";

/**
 * Créditos (COP) que se le cobran al cliente por cada acción.
 * Para "voice" el valor es por minuto.
 */
export const CREDIT_COST: Record<UsageEventType, number> = {
  ori: 10,
  milink: 20,
  widget: 20,
  text_test: 10,
  whatsapp_ai: 60,
  whatsapp_manual: 30,
  voice: 350, // por minuto
  doc_scan: 90,
  form_fill: 50,
  quote: 70
};

export const VOICE_CREDITS_PER_MINUTE = CREDIT_COST.voice;

/** Precios reales de Gemini (USD por millón de tokens). */
interface GeminiModelPrice {
  inputPerM: number;
  outputPerM: number;
}

const GEMINI_PRICES: Record<string, GeminiModelPrice> = {
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10.0 }
};

const DEFAULT_GEMINI_PRICE: GeminiModelPrice = GEMINI_PRICES["gemini-2.5-flash"];

/** Costo real Twilio por mensaje WhatsApp (entrante o saliente), USD. */
export const TWILIO_WA_USD_PER_MSG = 0.005;

/** Costo real de voz por minuto (Telnyx + Gemini Live), USD. */
export const VOICE_USD_PER_MINUTE = 0.05;

function geminiPriceFor(model?: string | null): GeminiModelPrice {
  if (!model) return DEFAULT_GEMINI_PRICE;
  const key = Object.keys(GEMINI_PRICES).find((m) => model.startsWith(m));
  return key ? GEMINI_PRICES[key] : DEFAULT_GEMINI_PRICE;
}

/** Costo real (USD) de una generación de Gemini según tokens. */
export function geminiCostUsd(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number {
  const price = geminiPriceFor(model);
  const input = (promptTokens / 1_000_000) * price.inputPerM;
  const output = (completionTokens / 1_000_000) * price.outputPerM;
  return input + output;
}

/** USD → COP redondeado a 2 decimales. */
export function usdToCop(usd: number): number {
  return Math.round(usd * TRM_COP * 100) / 100;
}

/** Créditos a cobrar para un evento. quantity aplica a eventos por unidad (ej: minutos de voz). */
export function creditsForEvent(eventType: UsageEventType, quantity = 1): number {
  const unit = CREDIT_COST[eventType] ?? 0;
  return Math.max(0, Math.round(unit * quantity));
}

/** Minutos facturables de voz: mínimo 1 minuto si hubo conexión. */
export function voiceBillableMinutes(durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(1, Math.ceil(durationSec / 60));
}

export function creditsForVoiceDuration(durationSec: number): number {
  return creditsForEvent("voice", voiceBillableMinutes(durationSec));
}
