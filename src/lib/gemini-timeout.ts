/**
 * Ninguna llamada a Gemini en el proyecto tenía límite de tiempo: si la API
 * se quedaba colgada (sin responder, sin error), el turno completo quedaba
 * mudo — sin respuesta al cliente y sin el aviso de "un asesor te
 * contactará", porque ese aviso solo se dispara cuando la llamada FALLA, no
 * cuando simplemente nunca vuelve.
 *
 * Casos reales que esto explica: WhatsApp/Laura colgada ~40 minutos
 * (ago-2026) y, con la extracción de campos por workflow ya activa (que
 * duplica las llamadas a Gemini por mensaje), la misma conversación volvió a
 * quedar sin respuesta minutos después de guardar el disparador.
 *
 * `abortSignal` sí cancela la solicitud HTTP subyacente (soportado por
 * @google/genai) — no es un simple "dejar de esperar", libera el recurso.
 */
export const GEMINI_CALL_TIMEOUT_MS = 45_000;

export class GeminiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini no respondió en ${timeoutMs}ms`);
    this.name = "GeminiTimeoutError";
  }
}

export async function withGeminiTimeout<T>(
  fn: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number = GEMINI_CALL_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new GeminiTimeoutError(timeoutMs)), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new GeminiTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
