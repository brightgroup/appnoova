import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { getCodeColumns, getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";
import { columnsWithRole, hasRoleMap } from "@/lib/data-tables/column-roles";

/** Nombres más cortos que esto no identifican un producto de forma fiable. */
const MIN_PRODUCT_NAME_LENGTH = 6;

const URL_RE = /https?:\/\/[^\s<>()[\]{}"']+|\bwww\.[^\s<>()[\]{}"']+/gi;

/**
 * Fracción del nombre de una fila que debe aparecer en el texto para dar por
 * hecho que ese texto habla de ella.
 *
 * Contar coincidencias en absoluto (antes bastaban 2 palabras) desliza mucho en
 * nombres largos: "Código General del Proceso y de Familia" comparte "familia"
 * y "del" con "La Familia. Redimensionamiento del Contenido Esencial de su
 * Concepto" — 2 de 6 palabras — y con eso se daba por bueno el precio de ese
 * libro para un producto que no tiene nada que ver. Fue justo lo que salió a
 * una clienta: precios de un libro sobre la familia bajo el encabezado del
 * Código General del Proceso.
 */
const MIN_NAME_COVERAGE = 0.5;

/**
 * Descarta la frase que introducía a una línea recién eliminada.
 *
 * Sin esto, quitar un enlace o un precio dejaba colgando su presentación
 * ("Puedes adquirirlo a través del siguiente enlace:") y el cliente recibía una
 * frase que no lleva a ninguna parte.
 */
export function dropOrphanLeadIn(keptLines: string[]): void {
  const last = keptLines[keptLines.length - 1]?.trim();
  if (last && last.length <= 200 && last.endsWith(":")) keptLines.pop();
}

/**
 * Columnas que identifican de forma inequívoca a un producto: nombre, código y
 * enlace. Se excluyen a propósito categorías o atributos compartidos ("Códigos",
 * "Físico"), que casarían con decenas de filas a la vez.
 */
export function getIdentityColumns(columns: DataTableColumn[]): DataTableColumn[] {
  const nameCol = getNameColumn(columns);
  const linkCols = hasRoleMap(columns)
    ? columnsWithRole(columns, "link")
    : columns.filter(c => {
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

  return rowsNamedIn(text, rows, nameCol);
}

/**
 * Filas cuyo NOMBRE reconoce el texto, sin admitir códigos ni enlaces.
 *
 * Es la atribución que se exige para dar por buena una línea que no nombra
 * nada por sí misma ("*Básico:* $35.000") apoyándose en el resto del bloque:
 * ahí no vale que en el bloque aparezca el enlace de otro producto, porque es
 * exactamente así como el modelo pega la ficha de un libro bajo el encabezado
 * de otro. Para la línea que sí lleva el enlace o el ISBN se sigue usando
 * `rowsReferredIn`, que los acepta.
 */
export function rowsNamedIn(
  text: string,
  rows: DataTableRowRecord[],
  nameCol: DataTableColumn | undefined
): DataTableRowRecord[] {
  return resolveNamedRows(text, rows, nameCol).rows;
}

export interface NamedRowsResult {
  /**
   * Atribución fiable: el texto nombra a este producto y solo a él. Vacío
   * cuando no nombra ninguno o cuando podría estar nombrando a varios.
   */
  rows: DataTableRowRecord[];
  /** Todas las filas que el texto podría estar nombrando. */
  family: DataTableRowRecord[];
  /**
   * El texto no permite quedarse con una sola fila: o enumera varias hermanas
   * ("Bolsillo / Básica / Anotada / Comentada") o nombra un producto que no
   * está en el catálogo y se parece a medias a varios que sí.
   */
  ambiguous: boolean;
}

/**
 * Atribución de un fragmento de respuesta a las filas del catálogo, separando
 * "aquí se nombra este producto" de "aquí se nombran varios".
 *
 * La diferencia se decide por cobertura completa: una ficha ("*Título:*
 * Constitución Política de Colombia Anotada / *Autor:* …") contiene el nombre
 * ENTERO de una fila y solo trozos de sus hermanas, así que se atribuye sin
 * dudar. Un listado de presentaciones contiene el nombre entero de varias, y un
 * encabezado inventado ("Código General del Proceso y de Familia") no contiene
 * el de ninguna: en ambos casos hay que abstenerse, porque quedarse con la que
 * más se le parece es lo que puso el precio y el enlace de un libro sobre la
 * familia bajo el encabezado de un código.
 */
export function resolveNamedRows(
  text: string,
  rows: DataTableRowRecord[],
  nameCol: DataTableColumn | undefined
): NamedRowsResult {
  // Sin los enlaces: el nombre del producto va dentro de la URL
  // (".../constitucion-politica-de-colombia-anotada/"), así que un enlace que el
  // modelo copió de otra ficha metía ese producto —y toda su familia— en el
  // ámbito del bloque, y con él su precio. Un enlace exacto sigue identificando
  // su fila por la vía fuerte de `rowsReferredIn`.
  const haystack = normalizeText(text.replace(URL_RE, " "));
  if (!haystack.trim() || !nameCol) return { rows: [], family: [], ambiguous: false };

  const scored = rows
    .map(row => ({ row, ...scoreName(row, nameCol, haystack) }))
    // Con una sola palabra en común ("código", "derecho") no se está nombrando
    // un producto: se estaría autorizando el precio de medio catálogo. Se salvan
    // los nombres de una sola palabra, donde esa palabra es el nombre entero.
    .filter(s => s.total > 0 && (s.hits >= 2 || (s.hits === 1 && s.total === 1)))
    .filter(s => s.hits / s.total >= MIN_NAME_COVERAGE);

  if (scored.length === 0) return { rows: [], family: [], ambiguous: false };

  const family = [...scored].sort((a, b) => b.hits - a.hits).map(s => s.row);
  const exact = scored.filter(s => s.hits === s.total);
  if (exact.length === 1) return { rows: [exact[0].row], family, ambiguous: false };

  if (family.length > 1) return { rows: [], family, ambiguous: true };

  const best = Math.max(...scored.map(s => s.hits));
  return { rows: scored.filter(s => s.hits === best).map(s => s.row), family, ambiguous: false };
}

function nameWords(row: DataTableRowRecord, nameCol: DataTableColumn): string[] {
  return [
    ...new Set(
      normalizeText(String(row.data[nameCol.key] ?? ""))
        .split(/[^a-z0-9]+/)
        .filter(w => w.length >= 3)
    ),
  ];
}

function scoreName(
  row: DataTableRowRecord,
  nameCol: DataTableColumn,
  haystack: string
): { hits: number; total: number } {
  const unique = nameWords(row, nameCol);
  return { hits: unique.filter(w => haystack.includes(w)).length, total: unique.length };
}

/**
 * Dentro de una familia de productos hermanos, la fila de la que habla una
 * línea concreta — o null si la línea no lo dice.
 *
 * Un listado de presentaciones no repite el nombre completo en cada línea
 * ("*Bolsillo:* $65.000"), así que lo único que distingue una línea de otra es
 * la palabra que diferencia a esa fila de sus hermanas. Sin esto, el bloque
 * entero se atribuía a una sola presentación y el guardián reescribía las
 * demás con SU precio: cuatro presentaciones distintas quedaban las cuatro al
 * precio de la de bolsillo.
 */
export function rowForLineInFamily(
  line: string,
  family: DataTableRowRecord[],
  nameCol: DataTableColumn | undefined
): DataTableRowRecord | null {
  if (!nameCol || family.length < 2) return null;

  const words = family.map(row => nameWords(row, nameCol));
  const shared = words[0].filter(w => words.every(list => list.includes(w)));
  const lineWords = normalizeText(line)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const matches = family.filter((_row, i) => {
    const distinct = words[i].filter(w => !shared.includes(w));
    return distinct.length > 0 && distinct.every(w => lineWords.some(lw => sameWord(lw, w)));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Un encabezado de producto no es un párrafo: más largo que esto, no lo es. */
const HEADING_MAX_LENGTH = 80;

/**
 * ¿El bloque abre presentando un producto propio ("*Código de Comercio*")?
 *
 * Marca la diferencia entre un bloque que CONTINÚA lo anterior ("Con el envío,
 * el total es $89.000") y uno que cambia de producto. El primero puede heredar
 * la fila del bloque anterior; el segundo no, y si su encabezado no existe en el
 * catálogo, no puede heredar nada de nadie: heredar ahí es lo que hacía que un
 * producto inventado saliera con el precio y el enlace del producto vecino.
 */
export function blockOpensWithProductHeading(block: string): boolean {
  const first = block
    .split("\n")
    .map(l => l.trim())
    .find(Boolean);
  if (!first) return false;

  const bare = first.replace(/^[-*•>\s]+/, "").replace(/[*_`]/g, "").trim();
  if (!bare || bare.length > HEADING_MAX_LENGTH) return false;
  // "Etiqueta: valor" es una línea de ficha, no un encabezado.
  if (/:\s*\S/.test(bare)) return false;
  // Un encabezado nombra; no lleva importes ni cifras.
  if (/\d/.test(bare)) return false;
  return bare.split(/\s+/).filter(w => w.length >= 2).length >= 2;
}

/**
 * Igualdad de palabra tolerante al género: el modelo escribe "Anotado" donde el
 * catálogo dice "Anotada", "Básico" por "Básica". Sin esto, cada línea de un
 * listado de presentaciones dejaba de reconocer a su hermana y el bloque entero
 * se atribuía a la única cuyo género coincidía — todas al mismo precio.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && a.length === b.length && a.slice(0, -1) === b.slice(0, -1);
}
