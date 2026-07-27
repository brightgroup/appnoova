import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatRowsAsCatalog } from "@/lib/data-tables/format-context";
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

export async function buildDataTableContext(
  db: SupabaseClient,
  dataTableId: string,
  userMessage: string,
  organizationId?: string | null
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
  const catalog = formatRowsAsCatalog(columns, selected);

  const text = note && catalog.trim() ? `${note}\n\n${catalog}` : note || catalog;
  return { text, rows: selected, columns };
}
