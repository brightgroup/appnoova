import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { enforceCatalogAmounts } from "@/lib/data-tables/price-guard";
import { enforceCatalogFields, enforceCatalogLinks } from "@/lib/data-tables/field-guard";

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
export interface CatalogGuardResult {
  text: string;
  violations: unknown[];
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

  return {
    text: amounts.text,
    violations: [...fields.violations, ...links.violations, ...amounts.violations],
  };
}
