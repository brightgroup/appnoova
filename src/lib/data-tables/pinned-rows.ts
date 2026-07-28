import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";

/** Máximo de productos que se arrastran desde lo ya hablado en la conversación. */
export const MAX_PINNED_ROWS = 8;

/** Nombres más cortos que esto no se buscan: dan falsos positivos. */
const MIN_PINNED_NAME_LENGTH = 8;

/**
 * Filas del catálogo cuyo nombre aparece literalmente en el texto reciente de
 * la conversación (típicamente la última respuesta del agente).
 *
 * La búsqueda del catálogo solo mira el mensaje actual del cliente, y los
 * mensajes de seguimiento casi nunca repiten el nombre del producto: "¿esos
 * precios son en físico?", "¿por qué al entrar al link cambia el precio?".
 * Con solo ese texto la búsqueda devuelve filas de productos ajenos (calzan
 * palabras como "precio", "libros" o "personas" dentro de reseñas largas) y el
 * producto del que realmente se venía hablando desaparece del contexto: el
 * modelo se queda sin su precio real justo cuando el cliente lo está
 * cuestionando, y termina improvisando.
 *
 * Anclando aquí los productos ya nombrados, sus datos reales siguen presentes
 * durante todo el hilo.
 */
export function pinRowsMentionedIn(
  conversationText: string,
  allRows: DataTableRowRecord[],
  columns: DataTableColumn[]
): DataTableRowRecord[] {
  const nameCol = getNameColumn(columns);
  if (!nameCol || !conversationText.trim()) return [];

  const haystack = normalizeText(conversationText);
  const pinned: DataTableRowRecord[] = [];

  for (const row of allRows) {
    const name = normalizeText(String(row.data[nameCol.key] ?? ""));
    if (name.length < MIN_PINNED_NAME_LENGTH) continue;
    if (!haystack.includes(name)) continue;
    pinned.push(row);
    if (pinned.length >= MAX_PINNED_ROWS) break;
  }

  return pinned;
}

/** Une filas sin repetir, conservando el orden de aparición. */
export function mergeRowsUnique(...groups: DataTableRowRecord[][]): DataTableRowRecord[] {
  const seen = new Set<string>();
  const out: DataTableRowRecord[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}
