import type { DataTableColumn } from "@/types/data-table";
import {
  FULL_CATALOG_MAX_ROWS,
  MAX_SUPPORTED_TABLE_ROWS,
  getCodeColumns,
  getNameColumn,
  getPrimaryFilterColumn,
} from "@/lib/data-tables/search-rows";

export { FULL_CATALOG_MAX_ROWS, MAX_SUPPORTED_TABLE_ROWS };

export interface ColumnMapping {
  product: string | null;
  category: string | null;
  sku: string | null;
}

export interface ImportValidation {
  ok: boolean;
  error?: string;
  warnings: string[];
  column_mapping: ColumnMapping;
  /** full_catalog = todo en cada mensaje; smart_search = búsqueda previa */
  search_mode: "full_catalog" | "smart_search";
}

export function validateDataTableImport(
  rowCount: number,
  columns: DataTableColumn[]
): ImportValidation {
  const nameCol = getNameColumn(columns);
  const filterCol = getPrimaryFilterColumn(columns);
  const codeCols = getCodeColumns(columns);

  const column_mapping: ColumnMapping = {
    product: nameCol?.label ?? null,
    category: filterCol?.label ?? null,
    sku: codeCols[0]?.label ?? null,
  };

  const search_mode: ImportValidation["search_mode"] =
    rowCount <= FULL_CATALOG_MAX_ROWS ? "full_catalog" : "smart_search";

  if (rowCount > MAX_SUPPORTED_TABLE_ROWS) {
    return {
      ok: false,
      error:
        `El archivo tiene ${rowCount.toLocaleString("es-CO")} registros. ` +
        `El límite del módulo Tablas es ${MAX_SUPPORTED_TABLE_ROWS.toLocaleString("es-CO")}. ` +
        "Para catálogos más grandes, conecta tu CRM o ERP mediante integración API.",
      warnings: [],
      column_mapping,
      search_mode,
    };
  }

  if (!nameCol) {
    return {
      ok: false,
      error:
        "No se detectó una columna de producto o nombre. " +
        "Incluye una columna llamada «Producto», «Nombre» o similar en la primera fila.",
      warnings: [],
      column_mapping,
      search_mode,
    };
  }

  const warnings: string[] = [];
  if (!filterCol) {
    warnings.push(
      "No se detectó columna de categoría (Categoría, Tipo, Línea…). " +
        "Se recomienda incluirla para filtrar catálogos grandes."
    );
  }
  if (codeCols.length === 0) {
    warnings.push(
      "No se detectó columna de SKU o código (SKU, Código, Referencia…). " +
        "Se recomienda incluirla para consultas exactas."
    );
  }

  return { ok: true, warnings, column_mapping, search_mode };
}

export function rowLimitError(currentCount: number): string | null {
  if (currentCount >= MAX_SUPPORTED_TABLE_ROWS) {
    return (
      `Esta tabla ya tiene ${currentCount.toLocaleString("es-CO")} registros (límite: ` +
      `${MAX_SUPPORTED_TABLE_ROWS.toLocaleString("es-CO")}). Para más productos, usa integración CRM/API.`
    );
  }
  return null;
}
