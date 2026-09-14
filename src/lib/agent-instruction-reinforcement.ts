/**
 * Bloque de refuerzo, igual para los tres motores (Gemini, GPT, Claude).
 *
 * El prompt del cliente (sección "3️⃣ Instrucciones Importantes" en
 * `agent-prompt-generator.ts`) es texto libre sin ninguna prioridad ni énfasis
 * especial: convive en medio de otras siete secciones. Gemini venía siguiendo
 * bien pasos condicionales como "pregunta la versión antes de dar el precio",
 * pero cuando un failover del motor primario (ver `llm/engines.ts`) deja
 * respondiendo a GPT-4o mini o a Claude, ese mismo prompt se sigue con menos
 * rigor: el modelo de respaldo tiende a resumir varios pasos en uno o a
 * responder de una vez en vez de preguntar primero. Esto le costó a un cliente
 * (Leyer, sept-2026) que la IA empezara a listar las cuatro presentaciones de
 * un libro de un tirón en lugar de preguntar cuál quería.
 *
 * No hay forma de detectar en runtime qué tan "obediente" es cada motor, así
 * que en vez de eso se refuerza la instrucción al final del prompt —después de
 * todo lo demás, justo antes del turno del usuario— para los tres motores por
 * igual: el objetivo es que el cliente reciba el mismo comportamiento sin
 * importar cuál terminó respondiendo, no ajustar el prompt por proveedor.
 */
export function buildInstructionReinforcementBlock(): string {
  return (
    "IMPORTANTE — Sigue la sección \"3️⃣ Instrucciones Importantes\" al pie de " +
    "la letra y en el orden exacto en que está escrita, sin resumir varios " +
    "pasos en uno ni saltarte una pregunta que deba hacerse antes de responder. " +
    "Si esas instrucciones piden preguntar algo (por ejemplo, qué versión, " +
    "presentación o variante quiere el cliente) antes de dar precio o datos, " +
    "DEBES preguntar primero y esperar la respuesta — nunca respondas de una " +
    "sola vez con todas las opciones o variantes disponibles."
  );
}
