/**
 * Ninguna llamada a un LLM en el proyecto tenía límite de tiempo: si el
 * proveedor se quedaba colgado (sin responder, sin error), el turno completo
 * quedaba mudo — sin respuesta al cliente y sin el aviso de "un asesor te
 * contactará", porque ese aviso solo se dispara cuando la llamada FALLA, no
 * cuando simplemente nunca vuelve.
 *
 * Casos reales que esto explica: WhatsApp/Laura colgada ~40 minutos
 * (ago-2026) y, con la extracción de campos por workflow ya activa (que
 * duplica las llamadas a Gemini por mensaje), la misma conversación volvió a
 * quedar sin respuesta minutos después de guardar el disparador.
 *
 * `abortSignal` sí cancela la solicitud HTTP subyacente (soportado por
 * @google/genai, @anthropic-ai/sdk y openai) — no es un simple "dejar de
 * esperar", libera el recurso.
 *
 * Empezó cubriendo solo Gemini (de ahí el nombre del archivo); ahora que hay
 * failover entre proveedores, cualquier motor sin timeout es un agujero por
 * el que el turno puede quedar mudo igual, así que `withLlmTimeout` es el
 * genérico y `withGeminiTimeout` queda como alias para no tocar los call
 * sites existentes.
 */
export const LLM_CALL_TIMEOUT_MS = 45_000;

export class LlmTimeoutError extends Error {
  constructor(timeoutMs: number, label = "El modelo de IA") {
    super(`${label} no respondió en ${timeoutMs}ms`);
    this.name = "LlmTimeoutError";
  }
}

export async function withLlmTimeout<T>(
  fn: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS,
  label?: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new LlmTimeoutError(timeoutMs, label)), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new LlmTimeoutError(timeoutMs, label);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Usa LLM_CALL_TIMEOUT_MS — el nombre se quedó corto desde que también cubre Claude/OpenAI. */
export const GEMINI_CALL_TIMEOUT_MS = LLM_CALL_TIMEOUT_MS;

/** @deprecated Usa LlmTimeoutError. */
export const GeminiTimeoutError = LlmTimeoutError;

/** @deprecated Usa withLlmTimeout() — se mantiene para no tocar los call sites de Gemini existentes. */
export function withGeminiTimeout<T>(
  fn: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS
): Promise<T> {
  return withLlmTimeout(fn, timeoutMs, "Gemini");
}
