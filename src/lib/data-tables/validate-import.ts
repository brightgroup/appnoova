import type { DataTableColumn } from "@/types/data-table";
import {
  FULL_CATALOG_MAX_ROWS,
  MAX_SUPPORTED_TABLE_ROWS,
  getCodeColumns,
  getNameColumn,
  getPrimaryFilterColumn,
} from "@/lib/data-tables/search-rows";
import { getPriceColumns } from "@/lib/data-tables/price-guard";
import { getIdentityColumns } from "@/lib/data-tables/row-match";
import type { ColumnRoleMap } from "@/lib/data-tables/column-roles";

export { FULL_CATALOG_MAX_ROWS, MAX_SUPPORTED_TABLE_ROWS };

export interface ColumnMapping {
  product: string | null;
  price: string[];
  category: string | null;
  sku: string | null;
  link: string | null;
}

export interface ImportValidation {
  ok: boolean;
  error?: string;
  warnings: string[];
  column_mapping: ColumnMapping;
  /** full_catalog = todo en cada mensaje; smart_search = búsqueda previa */
  search_mode: "full_catalog" | "smart_search";
}

/**
 * Mapeo que propone la detección automática, para precargar el importador.
 *
 * Es la misma adivinanza de siempre, pero puesta delante del usuario para que
 * la confirme: deja de ser una suposición silenciosa que solo se descubre
 * cuando el agente da un dato mal.
 */
export function suggestedRoleMap(columns: DataTableColumn[]): ColumnRoleMap {
  const nameCol = getNameColumn(columns);
  const codeCols = getCodeColumns(columns);
  const linkCol = getIdentityColumns(columns).find(
    c => c !== nameCol && !codeCols.includes(c)
  );
  const filterCol = getPrimaryFilterColumn(columns);
  const priceCols = getPriceColumns(columns);

  const map: ColumnRoleMap = {};
  if (nameCol) map.name = [nameCol.key];
  if (priceCols.length) map.price = priceCols.map(c => c.key);
  if (filterCol) map.category = [filterCol.key];
  if (codeCols.length) map.code = codeCols.map(c => c.key);
  if (linkCol) map.link = [linkCol.key];
  return map;
}

export function validateDataTableImport(
  rowCount: number,
  columns: DataTableColumn[]
): ImportValidation {
  const nameCol = getNameColumn(columns);
  const filterCol = getPrimaryFilterColumn(columns);
  const codeCols = getCodeColumns(columns);
  const priceCols = getPriceColumns(columns);
  const linkCol = getIdentityColumns(columns).find(
    c => c !== nameCol && !codeCols.includes(c)
  );

  const column_mapping: ColumnMapping = {
    product: nameCol?.label ?? null,
    price: priceCols.map(c => c.label),
    category: filterCol?.label ?? null,
    sku: codeCols[0]?.label ?? null,
    link: linkCol?.label ?? null,
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
        "No se detectó automáticamente la columna de producto. " +
        "Selecciónala abajo, en «Columnas clave», para continuar.",
      warnings: [],
      column_mapping,
      search_mode,
    };
  }

  const warnings: string[] = [];
  // El aviso más importante: sin columna de precio el blindaje de importes no
  // llega a ejecutarse, así que el agente podría dar cifras que nadie contrasta.
  if (priceCols.length === 0) {
    warnings.push(
      "No se marcó columna de precio. La IA no podrá verificar los importes que " +
        "mencione: no los contrastará contra la tabla. Márcala si tu catálogo tiene precios."
    );
  }
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
