import { toolProductRows, toolMovementRows, type OriToolCall } from "@/types/ori";

/**
 * Las dos UIs de Ori (escritorio: OriToolResultView; móvil: OriToolResultCards)
 * ya pintan los resultados de inventario como tabla real, tomando los números
 * directo de `tool_calls`. Cuando el modelo ADEMÁS enumera los productos en su
 * prosa, el cliente ve la misma lista dos veces — reportado por CMarket.
 *
 * El promptBlock de la tool ya pide no repetirla, pero un prompt no es
 * garantía (mismo aprendizaje que el motor genérico de cotizaciones: lo que
 * debe cumplirse siempre se fuerza en código). Esto quita la lista redactada
 * SOLO cuando efectivamente se va a renderizar una tabla con esas filas, y
 * deja intacto el texto de contexto que sí aporta.
 */

const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+/;
const TABLE_ROW = /^\s*\|/;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface RenderedKeys {
  /** Códigos y nombres de producto que la tabla ya muestra. */
  keys: string[];
  /** Solo códigos — sirven para detectar filas escritas sin viñeta ("ABC123 — Tornillo · 45"). */
  codes: string[];
  rows: number;
}

function collectRenderedKeys(toolCalls: OriToolCall[]): RenderedKeys {
  const keys: string[] = [];
  const codes: string[] = [];
  let rows = 0;

  for (const call of toolCalls) {
    for (const p of toolProductRows(call)) {
      rows += 1;
      const codigo = normalize(p.codigo ?? "");
      const nombre = normalize(p.nombre ?? "");
      if (codigo.length >= 3) { keys.push(codigo); codes.push(codigo); }
      if (nombre.length >= 4) keys.push(nombre);
    }
    for (const m of toolMovementRows(call)) {
      rows += 1;
      const producto = normalize(m.producto ?? "");
      if (producto.length >= 4) keys.push(producto);
    }
  }

  return { keys, codes, rows };
}

/** Frase mínima cuando el modelo no escribió nada más que la lista que acabamos de quitar. */
function fallbackSummary(toolCalls: OriToolCall[]): string {
  for (const call of toolCalls) {
    const productos = toolProductRows(call);
    if (productos.length > 0) {
      const total =
        typeof call.result.total_encontrados === "number" ? call.result.total_encontrados : productos.length;
      return total > productos.length
        ? `Te muestro ${productos.length} de ${total} productos:`
        : `Encontré ${total} producto${total === 1 ? "" : "s"}:`;
    }
    const movimientos = toolMovementRows(call);
    if (movimientos.length > 0) {
      return `Estos son los últimos ${movimientos.length} movimiento${movimientos.length === 1 ? "" : "s"}:`;
    }
  }
  return "";
}

export function stripRenderedRows(reply: string, toolCalls: OriToolCall[]): string {
  if (!reply.trim() || toolCalls.length === 0) return reply;

  const { keys, codes, rows } = collectRenderedKeys(toolCalls);
  // Sin filas renderizadas no hay duplicado que quitar: el texto es la única respuesta.
  if (rows === 0 || keys.length === 0) return reply;

  const kept = reply.split("\n").filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    // Tabla markdown redactada por el modelo — la tabla real va debajo.
    if (TABLE_ROW.test(trimmed)) return false;

    const normalized = normalize(trimmed);
    const mentionsRow = keys.some(k => normalized.includes(k));
    if (!mentionsRow) return true;

    if (BULLET.test(trimmed)) return false;
    // Fila escrita sin viñeta: empieza por un código que la tabla ya trae.
    if (codes.some(c => normalized.startsWith(c))) return false;
    return true;
  });

  const cleaned = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // El modelo respondió solo con la lista: dejamos una frase de contexto para
  // que la tabla no aparezca "suelta", sin mensaje.
  if (cleaned.length < 15) return fallbackSummary(toolCalls) || reply;
  return cleaned;
}
