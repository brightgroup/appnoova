import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatRowsAsCatalog } from "@/lib/data-tables/format-context";
import { mergeRowsUnique, pinRowsMentionedIn } from "@/lib/data-tables/pinned-rows";
import {
  FULL_CATALOG_MAX_ROWS,
  selectRowsForMessage,
  type RowSelectionResult,
} from "@/lib/data-tables/search-rows";

export interface DataTableContextResult {
  text: string;
  /** Filas realmente recuperadas para esta consulta — usadas luego para
   *  resolver los marcadores [[FICHA:<REF>]] contra datos reales. */
  rows: DataTableRowRecord[];
  columns: DataTableColumn[];
}

const EMPTY_CONTEXT: DataTableContextResult = { text: "", rows: [], columns: [] };

/**
 * Búsqueda del mensaje actual, rehecha con lo que el cliente pidió antes
 * cuando el mensaje actual no nombra ningún producto.
 *
 * Un "todas, solo necesito precios para comparar" no tiene con qué buscar: sus
 * únicas palabras útiles ("todas", "comparar") calzan por casualidad dentro de
 * reseñas de productos ajenos, y el modelo recibe un puñado de filas que nada
 * tienen que ver con lo que se le preguntó. Rehacer la búsqueda añadiendo los
 * mensajes anteriores del cliente recupera la petición real ("gaceta,
 * constitución, civil, laboral, propiedad horizontal, cpaca, filiación").
 *
 * El reintento solo se acepta si encuentra algo por nombre, código o categoría:
 * si también sale en falso se conserva el resultado original, para no arrastrar
 * productos viejos a una consulta que ya iba de otra cosa.
 */
function selectRowsWithFollowUp(
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  userMessage: string,
  previousUserText: string
): RowSelectionResult {
  const direct = selectRowsForMessage(rows, columns, userMessage);
  if (!direct.weak || !previousUserText.trim()) return direct;

  const retry = selectRowsForMessage(rows, columns, `${previousUserText}\n${userMessage}`);
  if (retry.weak || retry.rows.length === 0) return direct;

  return {
    ...retry,
    note: retry.note
      ? `${retry.note} La consulta actual continúa lo que el cliente pidió antes en este chat.`
      : retry.note,
  };
}

export interface DataTableContextOptions {
  /**
   * Texto reciente de la conversación (últimas respuestas del agente) para
   * mantener en contexto los productos ya nombrados, aunque el mensaje actual
   * no los repita. Ver `pinRowsMentionedIn`.
   */
  conversationText?: string | null;
  /**
   * Mensajes anteriores del propio cliente (ver `previousUserTextForCatalog`).
   * Se usan para rehacer la búsqueda cuando el mensaje actual no nombra ningún
   * producto — un "todas", "sí", "las dos" que continúa una petición anterior.
   */
  previousUserText?: string | null;
}

export async function buildDataTableContext(
  db: SupabaseClient,
  dataTableId: string,
  userMessage: string,
  organizationId?: string | null,
  options?: DataTableContextOptions
): Promise<DataTableContextResult> {
  let tableQuery = db.from("data_tables").select("*").eq("id", dataTableId);
  if (organizationId) tableQuery = tableQuery.eq("organization_id", organizationId);

  const { data: table, error: tableErr } = await tableQuery.maybeSingle();
  if (tableErr || !table) return EMPTY_CONTEXT;

  const columns = (table.columns ?? []) as DataTableColumn[];
  if (columns.length === 0) return EMPTY_CONTEXT;

  const { data: rows, error: rowsErr } = await db
    .from("data_table_rows")
    .select("*")
    .eq("data_table_id", dataTableId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (rowsErr || !rows?.length) return EMPTY_CONTEXT;

  const typedRows = rows as DataTableRowRecord[];
  const rowCount = typedRows.length;

  if (rowCount <= FULL_CATALOG_MAX_ROWS) {
    return { text: formatRowsAsCatalog(columns, typedRows), rows: typedRows, columns };
  }

  const { rows: selected, note } = selectRowsWithFollowUp(
    typedRows,
    columns,
    userMessage,
    options?.previousUserText ?? ""
  );
  const pinned = pinRowsMentionedIn(options?.conversationText ?? "", typedRows, columns);
  const rowsForContext = mergeRowsUnique(selected, pinned);
  const catalog = formatRowsAsCatalog(columns, rowsForContext);

  const carried = rowsForContext.length - selected.length;
  const fullNote = [
    note,
    carried > 0
      ? `Se incluyen además ${carried} producto(s) ya mencionados antes en esta conversación.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const text = fullNote && catalog.trim() ? `${fullNote}\n\n${catalog}` : fullNote || catalog;
  return { text, rows: rowsForContext, columns };
}
