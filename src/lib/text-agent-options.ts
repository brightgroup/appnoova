import { DEFAULT_ENGINE_ID } from "@/lib/llm/engines";

/**
 * "Estándar" no nombra el proveedor a propósito: por detrás hay failover
 * automático a otro motor si el principal falla o se cuelga (ver
 * resolveEngineChain en lib/llm/engines.ts), así que la etiqueta no puede
 * prometer un proveedor puntual. Gemini 2.5 Flash sigue siendo el motor
 * primario de los agentes creados antes de este cambio — no se les mueve el
 * default, solo ganan el mismo respaldo automático.
 *
 * Sin Claude Sonnet 5 a propósito (2026-08-20): se deja reservado para el
 * nodo `action.ai_extract` de workflows (ver AI_EXTRACT_MODEL_OPTIONS en
 * WorkflowEditor.tsx), donde el usuario ya probó que ordena mejor datos
 * estructurados. En la conversación con el cliente no aporta lo mismo y sale
 * más caro que Haiku — no hay ningún agente en producción usándolo hoy
 * (verificado contra la base), así que sacarlo no rompe nada existente.
 */
export const TEXT_LLM_MODELS = [
  { id: "gpt-4o-mini", label: "Estándar — recomendado (rápido y económico)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (Anthropic)" }
] as const;

export const DEFAULT_TEXT_MODEL = DEFAULT_ENGINE_ID;

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
