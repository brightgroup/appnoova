import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import {
  enforceCatalogAmounts,
  UNVERIFIED_PRICE_NOTE,
  type AmountViolation,
} from "@/lib/data-tables/price-guard";
import {
  enforceCatalogFields,
  enforceCatalogLinks,
  type FieldViolation,
  type LinkViolation,
} from "@/lib/data-tables/field-guard";

/**
 * Contraste final de la respuesta del agente contra los datos reales del
 * catálogo, antes de que salga hacia el cliente.
 *
 * Se aplica en este orden a propósito:
 *  1. Campos de ficha ("*Autor:*", "*Edición/Año:*", "*Precio:*") — es donde
 *     el modelo mete casi todos los datos, porque el prompt del cliente le
 *     define esa plantilla; cada línea se contrasta con su columna.
 *  2. Enlaces — se caen los que no existen en el catálogo ni en el prompt.
 *  3. Importes en texto libre — lo que no viaja dentro de una ficha
 *     ("ese libro cuesta $75.000").
 */
export type CatalogViolation = FieldViolation | LinkViolation | AmountViolation;

export interface CatalogGuardResult {
  text: string;
  violations: CatalogViolation[];
  /**
   * El agente afirmó algo que no existe en el catálogo y no se pudo sustituir
   * por el dato real: se eliminó del mensaje y el cliente se queda sin
   * respuesta a lo que preguntó. Ahí no basta con callar el dato — hay que
   * pasarle la conversación a un asesor.
   *
   * Una corrección no cuenta: el cliente sí recibe el dato correcto, tomado de
   * la base de datos, y no hay nada que un asesor tenga que resolver.
   */
  needsHuman: boolean;
}

export function enforceCatalogFacts(
  reply: string,
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  promptText?: string | null
): CatalogGuardResult {
  const fields = enforceCatalogFields(reply, rows, columns);
  const links = enforceCatalogLinks(fields.text, rows, columns, promptText);
  const amounts = enforceCatalogAmounts(links.text, rows, columns, promptText);

  const violations = [...fields.violations, ...links.violations, ...amounts.violations];
  const needsHuman = violations.some(v => v.action === "removed");

  // El guardián de importes ya sustituye la línea que elimina por el aviso.
  // Los campos de ficha y los enlaces se caen sin dejar rastro, así que el
  // aviso se añade aquí — una sola vez — para que el cliente sepa por qué le
  // falta ese dato y que alguien se lo va a resolver.
  const text =
    needsHuman && !amounts.text.includes(UNVERIFIED_PRICE_NOTE)
      ? `${amounts.text}\n\n${UNVERIFIED_PRICE_NOTE}`.trim()
      : amounts.text;

  return { text, violations, needsHuman };
}
