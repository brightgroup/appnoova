export type LlmProvider = "openai" | "google" | "anthropic";

export interface LlmEngine {
  /** Id de modelo tal como lo espera el SDK del proveedor (ej. "gpt-4o-mini"). */
  id: string;
  provider: LlmProvider;
}

const OPENAI_FLASH: LlmEngine = { id: "gpt-4o-mini", provider: "openai" };
const GEMINI_FLASH: LlmEngine = { id: "gemini-2.5-flash", provider: "google" };

/**
 * Motor por defecto para agentes nuevos. GPT-4o mini es más barato que Gemini Flash
 * en ambos lados ($0.15/$0.60 vs $0.30/$2.50 por millón de tokens — ver
 * developers.openai.com/api/docs/pricing y ai.google.dev/gemini-api/docs/pricing).
 * Los agentes existentes NO se mueven de aquí: su `llm_model` ya persistido en DB
 * sigue siendo `gemini-2.5-flash`, así que solo toman este default los agentes
 * creados de ahora en adelante.
 */
export const DEFAULT_ENGINE_ID = OPENAI_FLASH.id;

/**
 * Traduce el modelo elegido por el cliente (`text_agents.llm_model`) a la cadena de
 * motores a intentar, en orden. El cliente nunca ve este orden — su elección queda
 * intacta en la fila del agente; esto solo decide qué corre por detrás si el motor
 * primario falla o se cuelga.
 *
 * Claude es siempre elección explícita del cliente: nunca es el motor que otro
 * proveedor usa como respaldo automático (solo respalda, no lo respaldan).
 */
export function resolveEngineChain(clientModel: string | null | undefined): LlmEngine[] {
  const model = (clientModel ?? "").trim();

  if (model.startsWith("claude-")) {
    return [{ id: model, provider: "anthropic" }, OPENAI_FLASH];
  }
  if (model === GEMINI_FLASH.id) {
    return [GEMINI_FLASH, OPENAI_FLASH];
  }
  if (model === OPENAI_FLASH.id) {
    return [OPENAI_FLASH, GEMINI_FLASH];
  }
  // Modelo vacío/desconocido (dato corrupto o id retirado) — mismo criterio de
  // "caer al default en vez de romper" que resolveTextLlm en text-agent-options.ts.
  return [OPENAI_FLASH, GEMINI_FLASH];
}

/**
 * Cadena para tareas de IA internas de fondo (extracción de leads, análisis
 * de llamadas, captura de campañas — nada de esto lo elige el cliente, así
 * que no hay "modelo elegido" que traducir). Antes esto llamaba solo a
 * Gemini: todo el volumen caía sobre una sola cuenta/cuota. Ahora se reparte
 * entre los dos proveedores (orden al azar en cada llamada) y, si el que
 * arrancó primero falla, el segundo responde igual — mismo patrón de
 * failover que `resolveEngineChain`, pero pensado para repartir carga en
 * vez de respetar la elección de un cliente.
 */
export function resolveInternalEngineChain(): LlmEngine[] {
  return Math.random() < 0.5 ? [OPENAI_FLASH, GEMINI_FLASH] : [GEMINI_FLASH, OPENAI_FLASH];
}
