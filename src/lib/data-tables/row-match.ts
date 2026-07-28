import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { getCodeColumns, getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";

/** Nombres más cortos que esto no identifican un producto de forma fiable. */
const MIN_PRODUCT_NAME_LENGTH = 6;

/**
 * Columnas que identifican de forma inequívoca a un producto: nombre, código y
 * enlace. Se excluyen a propósito categorías o atributos compartidos ("Códigos",
 * "Físico"), que casarían con decenas de filas a la vez.
 */
export function getIdentityColumns(columns: DataTableColumn[]): DataTableColumn[] {
  const nameCol = getNameColumn(columns);
  const linkCols = columns.filter(c => {
    const n = normalizeText(`${c.label} ${c.key}`);
    return n.includes("link") || n.includes("url") || n.includes("enlace");
  });
  const all = [nameCol, ...getCodeColumns(columns), ...linkCols].filter(
    (c): c is DataTableColumn => Boolean(c)
  );
  return [...new Map(all.map(c => [c.key, c])).values()];
}

/**
 * Filas a las que se refiere un fragmento de la respuesta.
 *
 * No basta con buscar el nombre completo: el modelo abrevia ("la Constitución
 * Anotada") o parte la ficha en varias líneas. Se mide cuántas palabras del
 * nombre de cada fila aparecen en el texto y se conservan las que mejor
 * calzan; un código o un enlace exacto identifica la fila sin más.
 *
 * Devolver [] significa "este texto no habla de ningún producto concreto"
 * (por ejemplo una frase sobre el costo de envío), no "no hay coincidencias".
 */
export function rowsReferredIn(
  text: string,
  rows: DataTableRowRecord[],
  nameCol: DataTableColumn | undefined,
  strongCols: DataTableColumn[]
): DataTableRowRecord[] {
  const haystack = normalizeText(text);
  if (!haystack.trim()) return [];

  const strong = rows.filter(row =>
    strongCols.some(col => {
      const value = normalizeText(String(row.data[col.key] ?? ""));
      return value.length >= MIN_PRODUCT_NAME_LENGTH && haystack.includes(value);
    })
  );
  if (strong.length > 0) return strong;
  if (!nameCol) return [];

  const scored = rows.map(row => {
    const words = normalizeText(String(row.data[nameCol.key] ?? ""))
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3);
    const unique = [...new Set(words)];
    const hits = unique.filter(w => haystack.includes(w)).length;
    return { row, hits, total: unique.length };
  });

  const best = Math.max(0, ...scored.map(s => s.hits));
  // Con una sola palabra en común ("código", "derecho") no se está nombrando un
  // producto: se estaría autorizando el precio de medio catálogo.
  if (best < 2 && !scored.some(s => s.hits === best && s.total === 1 && best === 1)) return [];

  return scored.filter(s => s.hits === best).map(s => s.row);
}
