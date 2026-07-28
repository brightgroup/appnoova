import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatRowsAsCatalog } from "@/lib/data-tables/format-context";
import { mergeRowsUnique, pinRowsMentionedIn } from "@/lib/data-tables/pinned-rows";
import {
  FULL_CATALOG_MAX_ROWS,
  selectRowsForMessage,
} from "@/lib/data-tables/search-rows";

export interface DataTableContextResult {
  text: string;
  /** Filas realmente recuperadas para esta consulta — usadas luego para
   *  resolver los marcadores [[FICHA:<REF>]] contra datos reales. */
  rows: DataTableRowRecord[];
  columns: DataTableColumn[];
}

const EMPTY_CONTEXT: DataTableContextResult = { text: "", rows: [], columns: [] };

export interface DataTableContextOptions {
  /**
   * Texto reciente de la conversación (últimas respuestas del agente) para
   * mantener en contexto los productos ya nombrados, aunque el mensaje actual
   * no los repita. Ver `pinRowsMentionedIn`.
   */
  conversationText?: string | null;
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

  const { rows: selected, note } = selectRowsForMessage(typedRows, columns, userMessage);
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
