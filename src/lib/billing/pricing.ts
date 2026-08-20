/**
 * Precios y costos de facturación.
 * Créditos anclados en USD (1 crédito = credit_usd_value USD).
 * COP/TRM solo referencia visual en admin.
 */

import {
  DEFAULT_CREDIT_COST,
  DEFAULT_PROVIDER_RATES,
  DEFAULT_TRM_COP,
  DEFAULT_USAGE_MARGIN_MULTIPLIER,
} from "@/lib/billing/pricing-defaults";
import { getPricingConfig } from "@/lib/billing/pricing-config";
import { creditsFromUsdPrice } from "@/lib/billing/credit-usd";
import type { UsageEventType, VoiceBillingProvider } from "@/lib/billing/pricing-types";

export type { UsageEventType, VoiceBillingProvider } from "@/lib/billing/pricing-types";

export { getCreditUsdValue, creditsFromUsdPrice, usdPriceFromCredits, usdToCopReference, creditsToCopReference } from "@/lib/billing/credit-usd";

/** TRM activa — solo referencia COP en admin. */
export function getTrmCop(): number {
  return getPricingConfig().trmCop ?? DEFAULT_TRM_COP;
}

/** @deprecated Usar getTrmCop() */
export const TRM_COP = DEFAULT_TRM_COP;

export function getUnitPriceUsd(eventType: UsageEventType): number {
  return getPricingConfig().unitPriceUsd[eventType] ?? 0;
}

/** Múltiplo sobre el costo real que actúa como piso de crédito en turnos caros. */
export function getUsageMarginMultiplier(): number {
  return getPricingConfig().usageMarginMultiplier ?? DEFAULT_USAGE_MARGIN_MULTIPLIER;
}

/** Créditos por tipo de evento (calculados desde price_usd). */
export function getCreditCost(): Record<UsageEventType, number> {
  const config = getPricingConfig();
  const out = { ...DEFAULT_CREDIT_COST };
  for (const key of Object.keys(out) as UsageEventType[]) {
    const price = config.unitPriceUsd[key];
    if (price > 0) out[key] = creditsFromUsdPrice(price);
  }
  return out;
}

/** @deprecated Usar getCreditCost() */
export const CREDIT_COST: Record<UsageEventType, number> = DEFAULT_CREDIT_COST;

export function getTwilioWaUsdPerMsg(): number {
  return getPricingConfig().providerRates.twilio_wa_per_msg ?? DEFAULT_PROVIDER_RATES.twilio_wa_per_msg;
}

/**
 * Tarifa de referencia para WhatsApp vía Meta Cloud API directo (sin Twilio).
 * Meta en realidad cobra por ventana de conversación (24h), no por mensaje — esto es
 * una aproximación por mensaje para que el consumo por Meta directo deje de estar en $0.
 */
export function getMetaWaUsdPerMsg(): number {
  return getPricingConfig().providerRates.meta_wa_per_msg ?? DEFAULT_PROVIDER_RATES.meta_wa_per_msg;
}

export function getVoiceUsdPerMinute(provider: VoiceBillingProvider = "google"): number {
  const rates = getPricingConfig().providerRates;
  return provider === "elevenlabs"
    ? rates.voice_premium_per_min ?? DEFAULT_PROVIDER_RATES.voice_premium_per_min
    : rates.voice_standard_per_min ?? DEFAULT_PROVIDER_RATES.voice_standard_per_min;
}

/** @deprecated */
export const TWILIO_WA_USD_PER_MSG = DEFAULT_PROVIDER_RATES.twilio_wa_per_msg;
/** @deprecated */
export const VOICE_USD_PER_MINUTE = DEFAULT_PROVIDER_RATES.voice_standard_per_min;
/** @deprecated */
export const VOICE_PREMIUM_USD_PER_MINUTE = DEFAULT_PROVIDER_RATES.voice_premium_per_min;

interface LlmModelPrice {
  inputPerM: number;
  outputPerM: number;
}

/** Precios por modelo de LLM (Gemini + Claude + OpenAI), en USD por millón de tokens. */
function llmPricesFromConfig(): Record<string, LlmModelPrice> {
  const r = getPricingConfig().providerRates;
  return {
    "gemini-2.5-flash": {
      inputPerM: r.gemini_flash_input_per_m ?? DEFAULT_PROVIDER_RATES.gemini_flash_input_per_m,
      outputPerM: r.gemini_flash_output_per_m ?? DEFAULT_PROVIDER_RATES.gemini_flash_output_per_m,
    },
    "gemini-2.5-pro": {
      inputPerM: r.gemini_pro_input_per_m ?? DEFAULT_PROVIDER_RATES.gemini_pro_input_per_m,
      outputPerM: r.gemini_pro_output_per_m ?? DEFAULT_PROVIDER_RATES.gemini_pro_output_per_m,
    },
    "claude-haiku-4-5": {
      inputPerM: r.anthropic_haiku_input_per_m ?? DEFAULT_PROVIDER_RATES.anthropic_haiku_input_per_m,
      outputPerM: r.anthropic_haiku_output_per_m ?? DEFAULT_PROVIDER_RATES.anthropic_haiku_output_per_m,
    },
    "claude-sonnet-5": {
      inputPerM: r.anthropic_sonnet_input_per_m ?? DEFAULT_PROVIDER_RATES.anthropic_sonnet_input_per_m,
      outputPerM: r.anthropic_sonnet_output_per_m ?? DEFAULT_PROVIDER_RATES.anthropic_sonnet_output_per_m,
    },
    "gpt-4o-mini": {
      inputPerM: r.openai_4o_mini_input_per_m ?? DEFAULT_PROVIDER_RATES.openai_4o_mini_input_per_m,
      outputPerM: r.openai_4o_mini_output_per_m ?? DEFAULT_PROVIDER_RATES.openai_4o_mini_output_per_m,
    },
  };
}

function llmPriceFor(model?: string | null): LlmModelPrice {
  const prices = llmPricesFromConfig();
  const fallback = prices["gemini-2.5-flash"];
  if (!model) return fallback;
  const key = Object.keys(prices).find((m) => model.startsWith(m));
  return key ? prices[key] : fallback;
}

/** Devuelve el proveedor real según el modelo — para etiquetar `usage_events.provider`. */
export function providerForLlmModel(model?: string | null): "google" | "anthropic" | "openai" {
  if (model?.startsWith("claude-")) return "anthropic";
  if (model?.startsWith("gpt-")) return "openai";
  return "google";
}

export function llmCostUsd(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number {
  const price = llmPriceFor(model);
  const input = (promptTokens / 1_000_000) * price.inputPerM;
  const output = (completionTokens / 1_000_000) * price.outputPerM;
  return input + output;
}

/** @deprecated Usa llmCostUsd() — el nombre se quedó corto desde que también cubre Claude. */
export const geminiCostUsd = llmCostUsd;

/** Convierte USD a COP usando TRM de referencia (solo visualización / legacy). */
export function usdToCop(usd: number): number {
  return Math.round(usd * getTrmCop() * 100) / 100;
}

export function creditsForEvent(eventType: UsageEventType, quantity = 1): number {
  const priceUsd = getUnitPriceUsd(eventType);
  if (priceUsd > 0) return creditsFromUsdPrice(priceUsd, quantity);
  const legacyCop = DEFAULT_CREDIT_COST[eventType] ?? 0;
  if (legacyCop <= 0) return 0;
  return creditsFromUsdPrice(legacyCop / getTrmCop(), quantity);
}

export function voiceBillableMinutes(durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(1, Math.ceil(durationSec / 60));
}

export function creditsForVoiceDuration(
  durationSec: number,
  provider: VoiceBillingProvider = "google"
): number {
  const eventType = provider === "elevenlabs" ? "voice_premium" : "voice";
  return creditsForEvent(eventType, voiceBillableMinutes(durationSec));
}

/** Créditos por minuto de voz (para UI). */
export function voiceCreditsPerMinute(provider: VoiceBillingProvider = "google"): number {
  const eventType = provider === "elevenlabs" ? "voice_premium" : "voice";
  return creditsForEvent(eventType, 1);
}

/** @deprecated Usar voiceCreditsPerMinute() o catálogo de precios. */
export const VOICE_CREDITS_PER_MINUTE = creditsForEvent("voice", 1);
/** @deprecated Usar voiceCreditsPerMinute("elevenlabs") o catálogo de precios. */
export const VOICE_PREMIUM_CREDITS_PER_MINUTE = creditsForEvent("voice_premium", 1);
