/**
 * Permisos de WooCommerce POR AGENTE (jsonb `woocommerce_rules` en
 * `text_agents`/`voice_agents`) — mismo espíritu que `QuotingRules`
 * (ver src/lib/insurers/quoting-rules.ts): que la organización tenga la
 * tienda conectada no alcanza, cada agente necesita su propio interruptor.
 * Decisión explícita del usuario (2026-09-17): lectura y escritura son
 * configurables de forma independiente y por defecto todo apagado — el
 * cliente decide si su IA solo consulta o también actualiza productos/pedidos.
 */

export interface WooCommerceRules {
  /** El agente puede usar herramientas de WooCommerce en general. */
  enabled: boolean;
  canReadProducts: boolean;
  canReadOrders: boolean;
  canWriteProducts: boolean;
  canWriteOrders: boolean;
}

export const DEFAULT_WOOCOMMERCE_RULES: WooCommerceRules = {
  enabled: false,
  canReadProducts: false,
  canReadOrders: false,
  canWriteProducts: false,
  canWriteOrders: false
};

export function normalizeWooCommerceRules(raw: unknown): WooCommerceRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WOOCOMMERCE_RULES };
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    canReadProducts: r.canReadProducts === true,
    canReadOrders: r.canReadOrders === true,
    canWriteProducts: r.canWriteProducts === true,
    canWriteOrders: r.canWriteOrders === true
  };
}
