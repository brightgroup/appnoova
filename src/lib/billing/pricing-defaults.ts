import type { UsageEventType } from "@/lib/billing/pricing-types";

/** Valores por defecto si la BD no tiene configuración. */
export const DEFAULT_TRM_COP = 4200;
export const DEFAULT_CREDIT_USD_VALUE = 0.0003;

const trmRef = DEFAULT_TRM_COP;
const usdFromCopCredits = (copCredits: number) =>
  Math.round((copCredits / trmRef) * 1_000_000) / 1_000_000;

export const DEFAULT_CREDIT_COST: Record<UsageEventType, number> = {
  ori: 10,
  milink: 20,
  widget: 20,
  text_test: 10,
  whatsapp_ai: 60,
  whatsapp_manual: 30,
  voice: 900,
  voice_premium: 1200,
  doc_scan: 90,
  form_fill: 50,
  quote: 70,
};

export const DEFAULT_PROVIDER_RATES: Record<string, number> = {
  twilio_wa_per_msg: 0.005,
  voice_standard_per_min: 0.05,
  voice_premium_per_min: 0.12,
  gemini_flash_input_per_m: 0.3,
  gemini_flash_output_per_m: 2.5,
  gemini_pro_input_per_m: 1.25,
  gemini_pro_output_per_m: 10,
};

export interface UnitPriceMeta {
  event_type: UsageEventType;
  label: string;
  description: string | null;
  unit_label: string;
  category: string;
  price_usd: number;
  /** Referencia COP (visualización); no usar para cobro. */
  credits_cop: number;
  sort_order: number;
  is_active: boolean;
}

export interface ProviderRateMeta {
  rate_key: string;
  provider: string;
  label: string;
  description: string | null;
  unit_label: string;
  cost_usd: number;
  sort_order: number;
}

export const DEFAULT_UNIT_PRICE_META: UnitPriceMeta[] = [
  { event_type: "ori", label: "ORI", description: "Copiloto interno", unit_label: "por mensaje", category: "ori", price_usd: usdFromCopCredits(10), credits_cop: 10, sort_order: 10, is_active: true },
  { event_type: "milink", label: "Mi Link", description: "Chat web visitante", unit_label: "por mensaje", category: "milink", price_usd: usdFromCopCredits(20), credits_cop: 20, sort_order: 20, is_active: true },
  { event_type: "widget", label: "Widget web", description: "Chat embebido", unit_label: "por mensaje", category: "milink", price_usd: usdFromCopCredits(20), credits_cop: 20, sort_order: 21, is_active: true },
  { event_type: "text_test", label: "Prueba de agente", description: "Editor de agente", unit_label: "por mensaje", category: "milink", price_usd: usdFromCopCredits(10), credits_cop: 10, sort_order: 22, is_active: true },
  { event_type: "whatsapp_ai", label: "WhatsApp con IA", description: "Turno IA completo", unit_label: "por turno", category: "whatsapp", price_usd: usdFromCopCredits(60), credits_cop: 60, sort_order: 30, is_active: true },
  { event_type: "whatsapp_manual", label: "WhatsApp manual", description: "Sin IA", unit_label: "por mensaje", category: "whatsapp", price_usd: usdFromCopCredits(30), credits_cop: 30, sort_order: 31, is_active: true },
  { event_type: "voice", label: "Voz estándar", description: "Gemini Live + Telnyx", unit_label: "por minuto", category: "voice", price_usd: usdFromCopCredits(900), credits_cop: 900, sort_order: 40, is_active: true },
  { event_type: "voice_premium", label: "Voz premium", description: "ElevenLabs + Telnyx", unit_label: "por minuto", category: "voice", price_usd: usdFromCopCredits(1200), credits_cop: 1200, sort_order: 41, is_active: true },
  { event_type: "doc_scan", label: "Escaneo de documento", description: null, unit_label: "por documento", category: "documents", price_usd: usdFromCopCredits(90), credits_cop: 90, sort_order: 50, is_active: true },
  { event_type: "form_fill", label: "Llenado de formulario", description: null, unit_label: "por formulario", category: "documents", price_usd: usdFromCopCredits(50), credits_cop: 50, sort_order: 51, is_active: true },
  { event_type: "quote", label: "Cotización", description: null, unit_label: "por cotización", category: "documents", price_usd: usdFromCopCredits(70), credits_cop: 70, sort_order: 52, is_active: true },
];

export const DEFAULT_PROVIDER_RATE_META: ProviderRateMeta[] = [
  { rate_key: "twilio_wa_per_msg", provider: "twilio", label: "Twilio WhatsApp", description: "Mensaje entrante o saliente", unit_label: "por mensaje", cost_usd: 0.005, sort_order: 10 },
  { rate_key: "voice_standard_per_min", provider: "telnyx", label: "Voz estándar", description: "Telnyx + Gemini Live", unit_label: "por minuto", cost_usd: 0.05, sort_order: 20 },
  { rate_key: "voice_premium_per_min", provider: "elevenlabs", label: "Voz premium ElevenLabs", description: "ElevenLabs Agents", unit_label: "por minuto", cost_usd: 0.12, sort_order: 21 },
  { rate_key: "gemini_flash_input_per_m", provider: "google", label: "Gemini Flash entrada", description: null, unit_label: "por millón tokens", cost_usd: 0.3, sort_order: 30 },
  { rate_key: "gemini_flash_output_per_m", provider: "google", label: "Gemini Flash salida", description: null, unit_label: "por millón tokens", cost_usd: 2.5, sort_order: 31 },
  { rate_key: "gemini_pro_input_per_m", provider: "google", label: "Gemini Pro entrada", description: null, unit_label: "por millón tokens", cost_usd: 1.25, sort_order: 32 },
  { rate_key: "gemini_pro_output_per_m", provider: "google", label: "Gemini Pro salida", description: null, unit_label: "por millón tokens", cost_usd: 10, sort_order: 33 },
];
