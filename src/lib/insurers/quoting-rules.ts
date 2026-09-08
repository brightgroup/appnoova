/**
 * Activación del cotizador de seguros POR AGENTE (jsonb `quoting_rules` en
 * `text_agents`/`voice_agents`) — decisión explícita del usuario (2026-09-04):
 * que la organización tenga una aseguradora conectada NO alcanza para que un
 * agente cotice; cada agente necesita su propio interruptor, igual que
 * `scheduling_rules` (ver src/lib/scheduling/rules.ts).
 */

export interface QuotingRules {
  /** El agente puede REUNIR datos de cotización (placa + tomador) y dejarlos en la cola para el asesor. */
  enabled: boolean;
  /**
   * El agente puede dar el precio real DIRECTO al cliente, sin pasar por la
   * cola humana — decisión explícita 2026-09-05: por defecto en false. El
   * corredor que quiera autonomía completa la prende a propósito; mientras
   * tanto, `enabled` sin `autoQuote` deja al agente calificar y encolar, y un
   * asesor humano solicita el precio real desde la plataforma con un clic.
   */
  autoQuote: boolean;
  /**
   * Aseguradoras que este agente puede usar (ids de `insurer_connections`).
   * Hoy no se filtra por esto todavía porque solo existe La Equidad — queda
   * listo para cuando haya más de una aseguradora conectada por organización.
   */
  insurer_connection_ids: string[];
}

export const DEFAULT_QUOTING_RULES: QuotingRules = {
  enabled: false,
  autoQuote: false,
  insurer_connection_ids: []
};

export function normalizeQuotingRules(raw: unknown): QuotingRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_QUOTING_RULES };
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    autoQuote: r.autoQuote === true,
    insurer_connection_ids: Array.isArray(r.insurer_connection_ids)
      ? r.insurer_connection_ids.filter((id): id is string => typeof id === "string")
      : []
  };
}
