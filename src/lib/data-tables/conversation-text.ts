/** Cuántas respuestas recientes del agente se miran para anclar productos. */
const RECENT_ASSISTANT_TURNS = 2;

/** Cuántos mensajes previos del cliente se miran para rehacer la búsqueda. */
const RECENT_USER_TURNS = 2;

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

/**
 * Mensajes del cliente ANTERIORES al que se está respondiendo, usados para
 * rehacer la búsqueda cuando el mensaje actual no nombra ningún producto.
 *
 * El cliente reparte una misma petición en dos turnos: primero enumera lo que
 * quiere ("gaceta, constitución, civil, laboral, cpaca, filiación") y luego
 * responde a la repregunta del agente con un mensaje que ya no nombra nada
 * ("todas, solo necesito precios para comparar"). Como la búsqueda del catálogo
 * solo mira el mensaje actual, ese segundo turno no recupera ninguno de los
 * productos pedidos y el modelo redacta la tabla de precios sin datos: es
 * exactamente como salieron precios inventados a una clienta real.
 *
 * El texto del agente no sirve para esto (`recentAssistantTextForCatalog`
 * ancla solo lo que él ya había nombrado con su nombre de catálogo completo);
 * lo que hace falta es lo que pidió el cliente.
 */
export function previousUserTextForCatalog(
  messages: { role: string; content: string }[]
): string {
  const asked = messages.filter(m => m.role === "user" && m.content?.trim());
  // El último mensaje del cliente es el que se está respondiendo: ya es la
  // consulta principal, repetirlo aquí no aporta nada.
  return asked
    .slice(0, -1)
    .slice(-RECENT_USER_TURNS)
    .map(m => m.content)
    .join("\n");
}
