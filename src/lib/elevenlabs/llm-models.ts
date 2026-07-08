/**
 * Modelos LLM nativos de ElevenLabs para agentes de voz.
 *
 * ElevenLabs integra estos modelos con SUS propias credenciales: no hace falta
 * poner API keys de OpenAI/Anthropic/Google. Basta con enviar el id en
 * conversation_config.agent.prompt.llm al sincronizar el agente.
 *
 * Lista curada para llamadas (prioriza baja latencia + manejo limpio de
 * herramientas, es decir, que no filtren su "razonamiento" dentro de la voz).
 */
export interface ElevenLabsLlmOption {
  id: string;
  label: string;
}

export const ELEVENLABS_LLM_MODELS: ElevenLabsLlmOption[] = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — recomendado (rápido, sin fugas de idioma)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini — rápido y económico" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — más inteligente, algo más lento" },
  { id: "gpt-4o", label: "GPT-4o — potente, mayor costo/latencia" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (antiguo)" },
];

/** Modelo por defecto para agentes premium nuevos. */
export const ELEVENLABS_RECOMMENDED_LLM = "claude-haiku-4-5";

const VALID_LLM_IDS = new Set(ELEVENLABS_LLM_MODELS.map((m) => m.id));

export function isElevenLabsLlm(model?: string | null): boolean {
  return VALID_LLM_IDS.has((model ?? "").trim());
}

/**
 * Devuelve un modelo válido de ElevenLabs. Si el valor no aplica (por ejemplo,
 * un modelo de Google Live guardado antes, o vacío), cae al recomendado para no
 * romper la sincronización del agente con un id inválido.
 */
export function resolveElevenLabsLlm(model?: string | null): string {
  const m = (model ?? "").trim();
  return VALID_LLM_IDS.has(m) ? m : ELEVENLABS_RECOMMENDED_LLM;
}
