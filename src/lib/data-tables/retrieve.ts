import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatRowsAsCatalog } from "@/lib/data-tables/format-context";

const FULL_CATALOG_MAX_ROWS = 150;

function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function rowMatchesTerm(row: DataTableRowRecord, columns: DataTableColumn[], term: string): boolean {
  const n = normalizeText(term);
  if (!n) return false;
  return columns.some(col => {
    const v = row.data[col.key];
    if (v == null) return false;
    return normalizeText(String(v)).includes(n);
  });
}

function getPrimaryFilterColumn(columns: DataTableColumn[]): DataTableColumn | undefined {
  return columns.find(c => c.filterable) ?? columns.find(c =>
    normalizeText(c.label).includes("categoria") || normalizeText(c.key).includes("categoria")
  );
}

function getNameColumn(columns: DataTableColumn[]): DataTableColumn | undefined {
  return columns.find(c =>
    normalizeText(c.label).includes("producto") || normalizeText(c.key).includes("producto")
  ) ?? columns.find(c => normalizeText(c.label).includes("nombre"));
}

function distinctValues(rows: DataTableRowRecord[], col: DataTableColumn): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row.data[col.key];
    if (v != null && String(v).trim()) set.add(String(v).trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

function wantsCategories(message: string): boolean {
  const m = normalizeText(message);
  return (
    m.includes("categoria") ||
    m.includes("que tienen") ||
    m.includes("qué tienen") ||
    m.includes("que venden") ||
    m.includes("qué venden") ||
    m.includes("opciones") ||
    m.includes("menu") ||
    m.includes("menú") ||
    m.includes("catalogo") ||
    m.includes("catálogo")
  );
}

function findCategoryMatch(message: string, categories: string[]): string | null {
  const m = normalizeText(message);
  for (const cat of categories) {
    const n = normalizeText(cat);
    if (m.includes(n)) return cat;
  }
  return null;
}

function selectRowsForMessage(
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  message: string
): { rows: DataTableRowRecord[]; note?: string } {
  const active = rows.filter(r => r.is_active);
  if (active.length === 0) return { rows: [] };

  const filterCol = getPrimaryFilterColumn(columns);
  const nameCol = getNameColumn(columns);

  if (filterCol && wantsCategories(message)) {
    const cats = distinctValues(active, filterCol);
    if (cats.length > 0) {
      return {
        rows: [],
        note: `Categorías disponibles: ${cats.join(", ")}`,
      };
    }
  }

  if (filterCol) {
    const cats = distinctValues(active, filterCol);
    const match = findCategoryMatch(message, cats);
    if (match) {
      const filtered = active.filter(r => String(r.data[filterCol.key] ?? "").trim() === match);
      if (filtered.length > 0) return { rows: filtered };
    }
  }

  if (nameCol) {
    const terms = normalizeText(message).split(/\s+/).filter(t => t.length >= 4);
    for (const term of terms) {
      const hits = active.filter(r => normalizeText(String(r.data[nameCol.key] ?? "")).includes(term));
      if (hits.length > 0) return { rows: hits.slice(0, 25) };
    }
  }

  const fuzzy = active.filter(r => rowMatchesTerm(r, columns, message));
  if (fuzzy.length > 0 && fuzzy.length <= 30) return { rows: fuzzy };

  return { rows: active.slice(0, 40) };
}

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
  if (note) return `${note}\n\n${catalog}`;
  return catalog;
}
