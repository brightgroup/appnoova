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
  { id: 100, label: "Muy corto (~15-25 palabras)" },
  { id: 200, label: "Corto (~35-50 palabras)" },
  { id: 350, label: "Medio (~60-90 palabras)" },
  { id: 700, label: "Amplio (~150-200 palabras)" },
  { id: 1024, label: "Estándar (por defecto)" },
  { id: 2048, label: "Extendido (2 048 tokens)" },
  { id: 4096, label: "Largo (explicaciones extensas)" }
] as const;
