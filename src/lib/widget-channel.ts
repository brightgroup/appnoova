/** Canal de conversaciones iniciadas desde el widget embebible en sitios web. */
export const WEB_EMBED_CHANNEL = "web_embed";

/** Canal de conversaciones desde la página Mi Link (/c/slug). */
export const WEB_WIDGET_CHANNEL = "web_widget";

export type PublicChatChannel = typeof WEB_EMBED_CHANNEL | typeof WEB_WIDGET_CHANNEL;

export function resolvePublicChatChannel(value: unknown): PublicChatChannel {
  return value === WEB_EMBED_CHANNEL ? WEB_EMBED_CHANNEL : WEB_WIDGET_CHANNEL;
}

/**
 * `source` ("web" | "whatsapp") de una cotización según el canal de la
 * conversación — helper compartido por los tools de cotización
 * (*-quote-agent-tool.ts) para no repetir la lista de canales "que cuentan
 * como web" en cada archivo. "web_test" es el canal del panel "Probar
 * agente" del dashboard (ver src/app/api/text/agents/chat/route.ts) — no
 * tiene constante propia porque solo se usa como literal en ese código.
 */
export function resolveQuoteSource(channel: string | undefined): "web" | "whatsapp" {
  return channel === WEB_EMBED_CHANNEL || channel === WEB_WIDGET_CHANNEL || channel === "web_test" ? "web" : "whatsapp";
}
