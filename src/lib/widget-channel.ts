/** Canal de conversaciones iniciadas desde el widget embebible en sitios web. */
export const WEB_EMBED_CHANNEL = "web_embed";

/** Canal de conversaciones desde la página Mi Link (/c/slug). */
export const WEB_WIDGET_CHANNEL = "web_widget";

export type PublicChatChannel = typeof WEB_EMBED_CHANNEL | typeof WEB_WIDGET_CHANNEL;

export function resolvePublicChatChannel(value: unknown): PublicChatChannel {
  return value === WEB_EMBED_CHANNEL ? WEB_EMBED_CHANNEL : WEB_WIDGET_CHANNEL;
}
