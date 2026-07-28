/** Cuántas respuestas recientes del agente se miran para anclar productos. */
const RECENT_ASSISTANT_TURNS = 2;

/**
 * Texto de las últimas respuestas del agente, usado para mantener en contexto
 * los productos ya mencionados en el hilo (ver `pinRowsMentionedIn`).
 */
export function recentAssistantTextForCatalog(
  messages: { role: string; content: string }[]
): string {
  return messages
    .filter(m => m.role === "assistant" && m.content?.trim())
    .slice(-RECENT_ASSISTANT_TURNS)
    .map(m => m.content)
    .join("\n\n");
}
