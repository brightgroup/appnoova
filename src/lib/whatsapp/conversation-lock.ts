/**
 * Serializa el procesamiento de mensajes entrantes por conversación (mismo
 * canal + mismo contacto), en el orden en que llegan.
 *
 * Sin esto, dos mensajes casi simultáneos del mismo contacto (típico de un
 * clic en un anuncio de WhatsApp: llega el texto precargado del anuncio y,
 * un segundo después, el mensaje real del cliente) se procesaban en
 * paralelo — cada uno con su propia llamada a Gemini y su propia
 * lectura-modificación-escritura del array de mensajes de la conversación.
 * Eso causaba dos problemas reales:
 *  1. Contención entre las llamadas concurrentes a Gemini: una de las dos
 *     fallaba (429) y, tras el único reintento, escalaba a un asesor con el
 *     aviso genérico — a veces antes de que el cliente hubiera preguntado
 *     nada (casos "Isabel Otero"/Mapfre, ago-2026).
 *  2. Riesgo de mensaje perdido: dos procesos leen el mismo array de
 *     mensajes, cada uno le agrega el suyo y escribe su propia copia
 *     completa — el que escribe último pisa por completo el trabajo del
 *     otro, borrando ese mensaje de la conversación sin ningún error visible.
 */

const queues = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tope máximo que un mensaje espera su turno. Un turno normal (con imagen,
 * catálogo y reintento por sobrecarga incluidos) termina en pocos segundos;
 * 60s da margen generoso. Sin este tope, un turno colgado (p. ej. una llamada
 * a Gemini que nunca responde — ver el caso Qbit/Laura de ago-2026) dejaría
 * sin respuesta indefinidamente a TODOS los mensajes siguientes de ese mismo
 * contacto, no solo al que se colgó.
 */
const DEFAULT_MAX_WAIT_MS = 60_000;

/**
 * Ejecuta `fn` en exclusión mutua por `key`: si ya hay un turno de esta misma
 * conversación en curso, espera a que termine (o al tope de `maxWaitMs`,
 * lo que ocurra primero) antes de empezar.
 *
 * Un turno que falla no bloquea la cola: el siguiente mensaje igual puede
 * pasar en cuanto el anterior termine, haya tenido éxito o no.
 */
export function withConversationLock<T>(
  key: string,
  fn: () => Promise<T>,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const previousSettled = previous.then(
    () => undefined,
    () => undefined
  );

  const waitTurn = Promise.race([previousSettled, sleep(maxWaitMs)]);
  const run = waitTurn.then(fn);

  // Lo que encadena el SIGUIENTE mensaje de este contacto: nunca rechaza,
  // para que un turno fallido no bloquee la cola para siempre.
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });

  return run;
}
