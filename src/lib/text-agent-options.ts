import { ORI_DEFAULT_MODEL } from "@/lib/google-ai";

export const TEXT_LLM_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — recomendado (rápido y económico)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (Anthropic)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (Anthropic) — más inteligente, mayor costo" }
] as const;

export const DEFAULT_TEXT_MODEL = ORI_DEFAULT_MODEL;

const VALID_TEXT_MODEL_IDS = new Set<string>(TEXT_LLM_MODELS.map(m => m.id));

/**
 * Devuelve un modelo válido para agentes de texto. Si el valor guardado ya no
 * está en la lista (modelo retirado, dato corrupto), cae al default para no
 * romper la generación de respuesta ni la UI de configuración.
 */
export function resolveTextLlm(model?: string | null): string {
  const m = (model ?? "").trim();
  return VALID_TEXT_MODEL_IDS.has(m) ? m : DEFAULT_TEXT_MODEL;
}

/**
 * Este límite es un tope de seguridad (evita que una respuesta se corte a
 * media frase), no el control real del estilo/longitud — eso lo define el
 * prompt del agente (instrucción + un ejemplo concreto de largo esperado).
 * Los presets van más generosos que la longitud objetivo a propósito, para
 * que nunca corten una respuesta bien dentro de lo esperado.
 */
export const TEXT_OUTPUT_TOKEN_OPTIONS = [
  { id: 100, label: "100 tokens" },
  { id: 150, label: "150 tokens" },
  { id: 250, label: "250 tokens" },
  { id: 500, label: "500 tokens" },
  { id: 1024, label: "1024 tokens (por defecto)" },
  { id: 4096, label: "4096 tokens" }
] as const;
