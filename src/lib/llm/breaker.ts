/**
 * Circuit breaker en memoria, por motor (no por request). La app corre como
 * proceso Node largo (`server.ts`, vía `npm start`/`npm run dev`), no funciones
 * serverless efímeras, así que este estado sobrevive entre requests dentro de la
 * misma instancia — se reinicia con cada deploy, lo cual está bien: el objetivo es
 * amortiguar una caída del proveedor en curso, no llevar historial permanente.
 *
 * Sin esto, mientras un proveedor está caído cada turno paga el timeout completo
 * (`LLM_CALL_TIMEOUT_MS`, hoy 45s) antes de recién ahí caer al motor de respaldo.
 * Con el breaker abierto, un motor con fallos recientes se salta directo como
 * primario durante un enfriamiento corto.
 */

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

interface EngineState {
  consecutiveFailures: number;
  /** Epoch ms hasta el que el circuito sigue abierto; 0 si está cerrado. */
  openUntil: number;
}

const state = new Map<string, EngineState>();

function getState(engineId: string): EngineState {
  let s = state.get(engineId);
  if (!s) {
    s = { consecutiveFailures: 0, openUntil: 0 };
    state.set(engineId, s);
  }
  return s;
}

/** true si el motor tiene el circuito abierto y conviene saltarlo como primario. */
export function isEngineOpen(engineId: string): boolean {
  const s = getState(engineId);
  if (s.openUntil === 0) return false;
  if (Date.now() >= s.openUntil) {
    // Enfriamiento cumplido: se cierra el circuito y se le da otra oportunidad.
    s.openUntil = 0;
    s.consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function recordEngineSuccess(engineId: string): void {
  const s = getState(engineId);
  s.consecutiveFailures = 0;
  s.openUntil = 0;
}

export function recordEngineFailure(engineId: string): void {
  const s = getState(engineId);
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
    s.openUntil = Date.now() + COOLDOWN_MS;
  }
}
