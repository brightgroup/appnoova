import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatCell } from "@/lib/data-tables/format-context";
import { getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";
import {
  blockOpensWithProductHeading,
  dropOrphanLeadIn,
  getIdentityColumns,
  resolveNamedRows,
  rowForLineInFamily,
  rowsReferredIn,
} from "@/lib/data-tables/row-match";

/**
 * Blindaje de los datos de ficha (título, autor, edición, año, código,
 * enlace…), hermano del guardián de precios.
 *
 * El modelo rellena las plantillas de ficha que define el prompt del cliente
 * ("*Autor:*", "*Edición/Año:*") con lo que le parece: en la conversación que
 * originó esto escribió "Autor: Leyer" y "Edición/Año: 44 / 2026" para una
 * obra cuya fila dice otra cosa. Pedirle por prompt que use marcadores no
 * funcionó — no los usa.
 *
 * Aquí cada línea con formato "Etiqueta: valor" se contrasta contra la columna
 * equivalente de la fila que nombra ese fragmento: si no coincide se sustituye
 * por el valor real, y si la columna no tiene dato la línea se elimina (el
 * modelo se lo estaba inventando). Las etiquetas que no corresponden a ninguna
 * columna ("Formato:", que sale del prompt y no de la tabla) se dejan intactas.
 */

/**
 * "*Autor:* Álvaro Tafur", "- Precio: $10", "*Edición/Año:* 44 / 2026".
 *
 * Se captura el encabezado literal completo (con sus asteriscos y los dos
 * puntos) para poder rehacer la línea sin alterar el formato que el prompt del
 * cliente exige para WhatsApp. El viñetado exige espacio detrás, para no
 * confundir el "*" de un listado con el que abre una negrita.
 */
const LABELED_LINE_RE = /^(\s*(?:[-*•]\s+)?)(\*{0,2}[^:*\n]{2,40}:\*{0,2})\s*(.+)$/;

/** Sinónimos habituales entre lo que escribe el agente y el encabezado real. */
const LABEL_SYNONYMS: Record<string, string[]> = {
  titulo: ["nombre", "producto", "articulo", "obra"],
  obra: ["nombre", "producto"],
  libro: ["nombre", "producto"],
  autor: ["autor"],
  autores: ["autor"],
  edicion: ["ed", "edicion"],
  ano: ["ano", "year"],
  isbn: ["codigo", "isbn", "sku", "referencia"],
  codigo: ["codigo", "isbn", "sku", "referencia"],
  referencia: ["codigo", "referencia", "sku"],
  enlace: ["link", "url", "enlace"],
  link: ["link", "url", "enlace"],
  url: ["link", "url", "enlace"],
  "compra directa": ["link", "url", "enlace"],
  "compra": ["link", "url", "enlace"],
  paginas: ["paginas", "pages"],
  categoria: ["categoria", "category"],
  precio: ["precio", "costo", "valor"],
  valor: ["precio", "costo", "valor"],
  costo: ["precio", "costo", "valor"],
};

const MIN_TOKEN_LENGTH = 2;

/** Largo mínimo para emparejar una etiqueta con una columna por prefijo. */
const MIN_PREFIX_LENGTH = 4;

export interface FieldViolation {
  label: string;
  action: "corrected" | "removed";
  wrote: string;
  real?: string;
  product?: string;
}

export interface FieldGuardResult {
  text: string;
  violations: FieldViolation[];
  /**
   * Valores numéricos que este guardián escribió tomándolos de la fila real.
   * Los guardianes que corren después los dan por buenos: al reescribir una
   * línea puede perderse el texto que identificaba al producto, y sin esto el
   * guardián de importes no reconocía el precio que este acababa de corregir y
   * borraba su propia corrección.
   */
  verifiedAmounts: number[];
}

function labelKey(label: string): string {
  return normalizeText(label).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Columnas que puede representar una etiqueta escrita por el agente, de la más
 * específica a la más laxa. Devolver varias es deliberado: "Autor" encaja tanto
 * con "Autor (catálogo)" como con "Autor completo", y basta con que el valor
 * escrito coincida con una de ellas para darlo por bueno.
 */
function columnsForLabel(label: string, columns: DataTableColumn[]): DataTableColumn[] {
  const key = labelKey(label);
  if (!key) return [];

  const exact = columns.filter(c => labelKey(c.label) === key || labelKey(c.key) === key);
  if (exact.length > 0) return exact;

  const synonyms = LABEL_SYNONYMS[key] ?? [];
  const candidates = columns.filter(c => {
    const colKey = labelKey(c.label);
    const rawKey = labelKey(c.key);
    // Solo se admite que la COLUMNA amplíe la etiqueta ("Precio" → "Precio
    // COP"), nunca al revés, y por palabra completa. La dirección contraria
    // convertía cualquier etiqueta que empezara como una columna en un dato del
    // catálogo: "Número de contacto" tomaba la columna "N°" (el número de fila)
    // y "Nombre del asesor" tomaba el nombre del producto, así que el teléfono
    // de la librería y el nombre de la asesora salían reescritos.
    if (key.length >= MIN_PREFIX_LENGTH && colKey.startsWith(`${key} `)) return true;
    return synonyms.some(s => colKey === s || rawKey === s || colKey.startsWith(`${s} `));
  });
  return candidates;
}

function valueTokens(value: string): string[] {
  return normalizeText(value)
    // "1.200" y "1200" son el mismo dato: se colapsa el separador de miles
    // antes de partir, para no comparar trozos sueltos ("1" y "200").
    .replace(/(\d)[.,](?=\d{3}\b)/g, "$1")
    .split(/[^a-z0-9]+/)
    // Los números de una cifra cuentan: una edición "3" es un dato, mientras
    // que una letra suelta es ruido de puntuación.
    .filter(t => t.length >= MIN_TOKEN_LENGTH || /^\d$/.test(t));
}

/**
 * ¿El valor escrito representa el mismo dato que el real? Se compara por
 * palabras para tolerar el orden y la puntuación ("Tafur González, Álvaro" vs
 * "Álvaro Tafur González"), pero exigiendo que estén todas: cambiar "43" por
 * "44" o un apellido por otro no pasa.
 */
function valueMatches(wrote: string, realValues: string[], numericStrict: boolean): boolean {
  const wroteTokens = valueTokens(wrote);
  const setA = new Set(wroteTokens);
  const realTokens = new Set(realValues.flatMap(valueTokens));
  if (realTokens.size === 0) return false;

  // Basta con que estén todas las palabras del valor real. El agente suele
  // añadir contexto ("$192.000 COP", "Álvaro Tafur González, jurista"), y
  // rechazar eso hacía que se reescribiera una línea que era correcta,
  // truncando de paso el texto que la acompañaba.
  for (const t of realTokens) if (!setA.has(t)) return false;

  // En un campo numérico, en cambio, una cifra de más es un dato inventado:
  // "$160.000 con descuento $120.000" trae el precio real y otro que no existe.
  if (numericStrict && wroteTokens.some(t => /^\d+$/.test(t) && !realTokens.has(t))) {
    return false;
  }
  return true;
}

const URL_RE = /https?:\/\/[^\s<>()[\]{}"']+|\bwww\.[^\s<>()[\]{}"']+/gi;

/** Quita protocolo, "www." y barra final para poder comparar enlaces. */
function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/[.,;:!?)\]]+$/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export interface LinkViolation {
  url: string;
  action: "removed";
}

/**
 * Elimina los enlaces que no existen ni en el catálogo ni en las instrucciones
 * del agente.
 *
 * El modelo deduce URLs a partir del patrón que ve ("…/tienda/codigos/" + el
 * título en minúsculas con guiones). A veces acierta y a veces manda al cliente
 * a una página que no existe o, peor, a la de otro producto — que fue justo
 * como esta clienta descubrió que el precio no coincidía.
 */
export function enforceCatalogLinks(
  reply: string,
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  promptText?: string | null
): { text: string; violations: LinkViolation[] } {
  const urls = reply.match(URL_RE);
  if (!urls || urls.length === 0) return { text: reply, violations: [] };

  const allowed = new Set<string>();
  for (const row of rows) {
    for (const col of columns) {
      const value = String(row.data[col.key] ?? "");
      for (const found of value.match(URL_RE) ?? []) allowed.add(normalizeUrl(found));
    }
  }
  for (const found of (promptText ?? "").match(URL_RE) ?? []) allowed.add(normalizeUrl(found));

  const offenders = [...new Set(urls)].filter(u => !allowed.has(normalizeUrl(u)));
  if (offenders.length === 0) return { text: reply, violations: [] };

  const violations: LinkViolation[] = offenders.map(url => ({ url, action: "removed" }));
  const keptBlocks: string[] = [];

  for (const block of reply.split(/\n{2,}/)) {
    const keptLines: string[] = [];
    for (const line of block.split("\n")) {
      if (offenders.some(url => line.includes(url))) {
        dropOrphanLeadIn(keptLines);
        continue;
      }
      keptLines.push(line);
    }
    const rebuilt = keptLines.join("\n");
    if (rebuilt.trim()) keptBlocks.push(rebuilt);
  }

  return { text: keptBlocks.join("\n\n").trim(), violations };
}

export function enforceCatalogFields(
  reply: string,
  rows: DataTableRowRecord[],
  columns: DataTableColumn[]
): FieldGuardResult {
  if (!reply.trim() || rows.length === 0 || columns.length === 0) {
    return { text: reply, violations: [], verifiedAmounts: [] };
  }

  const nameCol = getNameColumn(columns);
  const strongCols = getIdentityColumns(columns).filter(c => c !== nameCol);
  const violations: FieldViolation[] = [];
  const verifiedAmounts: number[] = [];

  const blocks = reply.split(/\n{2,}/);
  const keptBlocks: string[] = [];

  // Mismo respaldo que en el guardián de importes: una ficha suelta sin repetir
  // el título habla del único producto que hay en contexto, y a partir de ahí
  // del último que quedó identificado.
  //
  // Antes se miraba la respuesta ENTERA, y en un listado de varios productos
  // eso significaba atribuir cualquier bloque huérfano al único producto que sí
  // estaba en el catálogo: al enlace de la Gaceta se le sustituyó el de un
  // libro sobre la familia, que era el que había calzado en otro bloque.
  let carriedRows = rows.length === 1 ? rows : [];

  for (const block of blocks) {
    const blockRows = rowsReferredIn(block, rows, nameCol, strongCols);
    if (blockRows.length > 0) carriedRows = blockRows;
    // Ver `resolveNamedRows`: un bloque que nombra a varias hermanas no se
    // puede atribuir a una sola, o se reescribe la ficha de una presentación
    // con el enlace y la edición de otra.
    const named = resolveNamedRows(block, rows, nameCol);
    // Ver el guardián de importes: un bloque que presenta un producto propio y
    // no lo encuentra en el catálogo no hereda la fila del bloque anterior.
    const inherited =
      named.rows.length === 0 && blockOpensWithProductHeading(block) ? [] : carriedRows;
    const keptLines: string[] = [];
    // Ver abajo: una ficha cuyo título no corresponde a la fila se cae entera.
    let blockPoisoned = false;

    for (const line of block.split("\n")) {
      const match = LABELED_LINE_RE.exec(line);
      if (!match) {
        keptLines.push(line);
        continue;
      }

      const [, indent, heading, wrote] = match;
      const label = heading.replace(/\*/g, "").replace(/:$/, "").trim();
      // Una etiqueta compuesta ("Edición/Año") cubre varias columnas a la vez.
      const parts = label.split("/").map(p => p.trim()).filter(Boolean);
      const mapped = parts.map(p => columnsForLabel(p, columns));
      if (mapped.some(cols => cols.length === 0)) {
        keptLines.push(line);
        continue;
      }

      const scope = rowsReferredIn(line, rows, nameCol, strongCols);
      const sibling = rowForLineInFamily(line, named.family, nameCol);
      const row =
        scope.length === 1
          ? scope[0]
          : sibling
            ? sibling
            : named.ambiguous
              ? null
              : blockRows.length === 1
                ? blockRows[0]
                : inherited.length === 1
                  ? inherited[0]
                  : null;
      if (!row) {
        keptLines.push(line);
        continue;
      }

      const realParts = mapped.map(cols => {
        const withValue = cols.find(c => {
          const v = row.data[c.key];
          return v !== null && v !== undefined && v !== "";
        });
        return withValue ? { col: withValue, value: formatCell(row.data[withValue.key], withValue) } : null;
      });

      // Un dato que la fila no tiene no puede aparecer en la respuesta.
      if (realParts.some(p => p === null)) {
        dropOrphanLeadIn(keptLines);
        violations.push({
          label,
          action: "removed",
          wrote: wrote.trim(),
          product: String((nameCol && row.data[nameCol.key]) || row.id),
        });
        continue;
      }

      const real = realParts.map(p => p!.value);
      // Una etiqueta simple puede corresponder a varias columnas ("Autor" →
      // "Autor (catálogo)" o "Autor completo"): basta con que el valor escrito
      // coincida con una de ellas. Una compuesta ("Edición/Año") se valida
      // contra el conjunto de todas sus partes a la vez.
      const ok =
        real.length === 1
          ? mapped[0].some(c => {
              const v = row.data[c.key];
              if (v === null || v === undefined || v === "") return false;
              return valueMatches(wrote, [formatCell(v, c)], c.type === "number");
            })
          : valueMatches(wrote, real, realParts.every(p => p!.col.type === "number"));

      if (ok) {
        keptLines.push(line);
        continue;
      }

      // El título es la identidad de la ficha, no un campo más. Si no coincide
      // con la fila, lo que hay delante no es un dato equivocado de este
      // producto: es la ficha de OTRO producto, y reescribirle el título la
      // convierte en la de un libro que el cliente nunca pidió — con su autor,
      // su precio y su enlace. Se cae la ficha entera y la resuelve un asesor.
      if (nameCol && mapped.some(cols => cols.includes(nameCol))) {
        blockPoisoned = true;
        violations.push({
          label,
          action: "removed",
          wrote: wrote.trim(),
          product: String(row.data[nameCol.key] || row.id),
        });
        break;
      }

      const rebuilt = `${indent}${heading} ${real.join(" / ")}`;
      keptLines.push(rebuilt);
      for (const part of realParts) {
        const raw = part!.col.type === "number" ? row.data[part!.col.key] : null;
        if (typeof raw === "number") verifiedAmounts.push(raw);
      }
      violations.push({
        label,
        action: "corrected",
        wrote: wrote.trim(),
        real: real.join(" / "),
        product: String((nameCol && row.data[nameCol.key]) || row.id),
      });
    }

    if (blockPoisoned) continue;

    const rebuilt = keptLines.join("\n");
    if (rebuilt.trim()) keptBlocks.push(rebuilt);
  }

  return { text: keptBlocks.join("\n\n").trim(), violations, verifiedAmounts };
}
