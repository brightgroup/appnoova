import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatRowsAsCatalog } from "@/lib/data-tables/format-context";
import {
  FULL_CATALOG_MAX_ROWS,
  selectRowsForMessage,
} from "@/lib/data-tables/search-rows";

export async function buildDataTableContext(
  db: SupabaseClient,
  dataTableId: string,
  userMessage: string,
  organizationId?: string | null
): Promise<string> {
  let tableQuery = db.from("data_tables").select("*").eq("id", dataTableId);
  if (organizationId) tableQuery = tableQuery.eq("organization_id", organizationId);

  const { data: table, error: tableErr } = await tableQuery.maybeSingle();
  if (tableErr || !table) return "";

  const columns = (table.columns ?? []) as DataTableColumn[];
  if (columns.length === 0) return "";

  const { data: rows, error: rowsErr } = await db
    .from("data_table_rows")
    .select("*")
    .eq("data_table_id", dataTableId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (rowsErr || !rows?.length) return "";

  const typedRows = rows as DataTableRowRecord[];
  const rowCount = typedRows.length;

  if (rowCount <= FULL_CATALOG_MAX_ROWS) {
    return formatRowsAsCatalog(columns, typedRows);
  }

  const { rows: selected, note } = selectRowsForMessage(typedRows, columns, userMessage);
  const catalog = formatRowsAsCatalog(columns, selected);

  if (note && catalog.trim()) return `${note}\n\n${catalog}`;
  if (note) return note;
  return catalog;
}
