import { ORI_DEFAULT_MODEL } from "@/lib/google-ai";

export const TEXT_LLM_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }
] as const;

export const DEFAULT_TEXT_MODEL = ORI_DEFAULT_MODEL;

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
