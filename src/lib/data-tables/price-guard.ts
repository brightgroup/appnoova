import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatCell } from "@/lib/data-tables/format-context";
import { getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";
import { dropOrphanLeadIn, getIdentityColumns, rowsReferredIn } from "@/lib/data-tables/row-match";

/**
 * Última barrera contra precios inventados.
 *
 * Las reglas del prompt (y los marcadores [[FICHA:…]]) dependen de que el
 * modelo quiera obedecerlas. En la práctica no siempre lo hace: cuando el
 * prompt del cliente define su propio formato de ficha ("*Precio:* …"), el
 * modelo lo rellena de su cosecha y, si la fila no llegó en el contexto,
 * escribe un precio verosímil con total seguridad. Eso es lo que llegó a
 * clientes finales.
 *
 * Aquí ya no se le pide nada al modelo: se leen los importes que escribió y se
 * contrastan contra los valores reales de las filas recuperadas. El que no
 * cuadre se corrige con el dato de la base de datos (si el producto del que
 * habla ese bloque es inequívoco) o se elimina. Nunca sale un precio que no
 * exista en el catálogo.
 */

const PRICE_COLUMN_HINTS = ["precio", "costo", "valor", "tarifa", "price"];

/** Importes escritos con símbolo de moneda: "$192.000", "$ 1.234,50". */
const CURRENCY_AMOUNT_RE = /\$\s*\d[\d.,]*\d|\$\s*\d/g;

/** En líneas de precio también se acepta el importe sin símbolo: "Precio: 192.000". */
const BARE_AMOUNT_RE = /(\S+\s+)?\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\b/g;

const PRICE_LINE_RE = /precio|costo|valor|tarifa/i;

/**
 * Palabras tras las que un número con separador de miles NO es dinero. Importa
 * en catálogos jurídicos, donde "Ley 1.098" o "Decreto 1.070" conviven con
 * precios en la misma línea; sin esto se borraría la línea entera por creer
 * que la cita normativa es un precio inventado.
 */
const NON_AMOUNT_PREFIX_RE =
  /\b(ley|leyes|decreto|decretos|articulo|artículo|art|arts|sentencia|resolucion|resolución|acuerdo|circular|norma|expediente|radicado|no|nro|num|número|numero)\.?\s*$/i;

const MAX_SUM_POOL = 12;

export interface AmountViolation {
  amount: string;
  action: "corrected" | "removed";
  replacement?: string;
  product?: string;
}

export interface AmountGuardResult {
  text: string;
  violations: AmountViolation[];
}

export function getPriceColumns(columns: DataTableColumn[]): DataTableColumn[] {
  return columns.filter(c => {
    const n = normalizeText(`${c.label} ${c.key}`);
    return PRICE_COLUMN_HINTS.some(h => n.includes(h));
  });
}

/**
 * "192.000" → 192000; "1.234,50" → 1234.5; "192,000" → 192000.
 * Se asume formato es-CO (punto de miles, coma decimal) salvo cuando la coma
 * separa exactamente tres dígitos finales, que es formato en-US de miles.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$\s]/g, "");
  if (!cleaned) return null;
  const usThousands = /^\d{1,3}(?:,\d{3})+$/.test(cleaned);
  const normalized = usThousands
    ? cleaned.replace(/,/g, "")
    : cleaned.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function amountsIn(text: string, includeBare: boolean): string[] {
  const found = text.match(CURRENCY_AMOUNT_RE) ?? [];
  if (!includeBare) return found;

  const rest = text.replace(CURRENCY_AMOUNT_RE, " ");
  const bare: string[] = [];
  for (const match of rest.matchAll(BARE_AMOUNT_RE)) {
    const prefix = match[1] ?? "";
    if (NON_AMOUNT_PREFIX_RE.test(prefix)) continue;
    bare.push(match[0].slice(prefix.length));
  }
  return [...found, ...bare];
}

function collectRealAmounts(
  rows: DataTableRowRecord[],
  priceCols: DataTableColumn[]
): Set<number> {
  const set = new Set<number>();
  for (const row of rows) {
    for (const col of priceCols) {
      const raw = row.data[col.key];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = typeof raw === "number" ? raw : parseAmount(String(raw));
      if (value !== null) set.add(value);
    }
  }
  return set;
}

/** Importes que el propio prompt del agente autoriza (envíos, bonos, mínimos). */
function collectAllowedFromPrompt(allowedText?: string | null): Set<number> {
  const set = new Set<number>();
  for (const raw of amountsIn(allowedText ?? "", false)) {
    const value = parseAmount(raw);
    if (value !== null) set.add(value);
  }
  return set;
}

/**
 * Solo en una línea que declara un total se admite que un importe sea la suma
 * de otros. Sin esta puerta, la tolerancia a sumas se come la validación: casi
 * cualquier precio inventado se puede escribir como suma de dos o tres cifras
 * conocidas ($50.000 × 3 = $150.000) y pasaría inadvertido.
 */
const TOTAL_LINE_RE = /\btotal(es)?\b|\bsuma\b|\bsumando\b|\ben conjunto\b|\blos dos\b|\bambos\b/i;

/**
 * Suma de dos o tres importes ya verificados (libro + envío, dos libros…).
 * El prompt permite sumas simples con números explícitos del catálogo, así que
 * un total legítimo no debe tratarse como invento.
 */
function isSumOfKnown(value: number, pool: number[]): boolean {
  const items = pool.slice(0, MAX_SUM_POOL);
  for (let i = 0; i < items.length; i++) {
    for (let j = i; j < items.length; j++) {
      if (Math.abs(items[i] + items[j] - value) < 0.01) return true;
      for (let k = j; k < items.length; k++) {
        if (Math.abs(items[i] + items[j] + items[k] - value) < 0.01) return true;
      }
    }
  }
  return false;
}

/** Columna de precio a usar para corregir: la que nombre la propia línea, si la nombra. */
function priceColumnForLine(
  line: string,
  row: DataTableRowRecord,
  priceCols: DataTableColumn[]
): DataTableColumn | undefined {
  const lineNorm = normalizeText(line);
  const named = priceCols.find(c => {
    const label = normalizeText(c.label);
    return label.length >= 4 && lineNorm.includes(label);
  });
  const hasValue = (c: DataTableColumn) => {
    const v = row.data[c.key];
    return v !== null && v !== undefined && v !== "";
  };
  if (named && hasValue(named)) return named;
  return priceCols.find(hasValue);
}

/**
 * Reemplaza a la línea que se cayó. Anuncia el traspaso porque el sistema lo
 * ejecuta de verdad (ver `needsHuman` en catalog-guard): sin eso el cliente se
 * quedaba sin el dato y sin nadie que se lo diera.
 */
export const UNVERIFIED_PRICE_NOTE =
  "No tengo ese dato confirmado en el catálogo. Te paso con un asesor de nuestro equipo para que te lo confirme; en un momento te atienden por este mismo chat.";

export function enforceCatalogAmounts(
  reply: string,
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  allowedText?: string | null,
  /** Importes ya tomados de la base de datos por un guardián anterior. */
  preVerified: number[] = []
): AmountGuardResult {
  const priceCols = getPriceColumns(columns);
  // Sin columna de precios, el dinero que mencione el agente no sale del
  // catálogo (viene de su prompt) y no hay nada contra qué contrastarlo.
  if (priceCols.length === 0 || !reply.trim()) return { text: reply, violations: [] };

  const strongCols = getIdentityColumns(columns).filter(c => c !== getNameColumn(columns));
  const nameCol = getNameColumn(columns);
  const promptAmounts = collectAllowedFromPrompt(allowedText);
  for (const value of preVerified) promptAmounts.add(value);

  // Importes que el agente escribió y que sí existen en alguna fila del
  // contexto. No sirven para dar por bueno un precio suelto (con decenas de
  // filas casi cualquier cifra calzaría con alguna), pero sí para reconocer
  // totales legítimos: "el libro $80.000 + envío $9.000 = $89.000", donde el
  // total va en otra frase que ya no nombra el producto.
  const catalogAmounts = collectRealAmounts(rows, priceCols);
  const verifiedInReply = amountsIn(reply, true)
    .map(parseAmount)
    .filter((v): v is number => v !== null && catalogAmounts.has(v));

  const violations: AmountViolation[] = [];
  let removedAny = false;

  const blocks = reply.split(/\n{2,}/);
  const keptBlocks: string[] = [];

  for (const block of blocks) {
    const blockRows = rowsReferredIn(block, rows, nameCol, strongCols);
    const keptLines: string[] = [];

    for (const line of block.split("\n")) {
      // El producto que nombra la propia línea manda sobre el del bloque: en
      // un listado ("Bolsillo: $65.000") cada línea habla de una fila distinta.
      const lineRows = rowsReferredIn(line, rows, nameCol, strongCols);
      const scope = lineRows.length > 0 ? lineRows : blockRows;

      // Solo se dan por buenos los precios del producto del que habla este
      // texto (más los importes que el propio prompt autoriza: envíos, bonos).
      // Aceptar cualquier precio del catálogo no sirve de nada: con decenas de
      // filas en contexto, casi cualquier cifra redonda coincidiría con alguna.
      const scopeAmounts = collectRealAmounts(scope, priceCols);
      const isKnown = (v: number) => scopeAmounts.has(v) || promptAmounts.has(v);
      const sumPool = [...new Set([...scopeAmounts, ...promptAmounts, ...verifiedInReply])];

      const includeBare = PRICE_LINE_RE.test(line);
      const allowSums = TOTAL_LINE_RE.test(line);
      const offenders = amountsIn(line, includeBare).filter(raw => {
        const value = parseAmount(raw);
        if (value === null || isKnown(value)) return false;
        return !(allowSums && isSumOfKnown(value, sumPool));
      });

      if (offenders.length === 0) {
        keptLines.push(line);
        continue;
      }

      const row = scope.length === 1 ? scope[0] : null;
      const col = row ? priceColumnForLine(line, row, priceCols) : undefined;

      if (row && col) {
        let fixed = line;
        for (const offender of offenders) {
          const real = formatCell(row.data[col.key], col);
          fixed = fixed.replace(offender, real);
          violations.push({
            amount: offender,
            action: "corrected",
            replacement: real,
            product: String((nameCol && row.data[nameCol.key]) || row.id),
          });
        }
        keptLines.push(fixed);
        continue;
      }

      // La línea con el precio sin respaldo se cae; en su lugar queda el aviso
      // (una sola vez), para que el mensaje no pierda el hilo.
      dropOrphanLeadIn(keptLines);
      if (!removedAny) keptLines.push(UNVERIFIED_PRICE_NOTE);
      removedAny = true;
      for (const offender of offenders) {
        violations.push({ amount: offender, action: "removed" });
      }
    }

    const rebuilt = keptLines.join("\n");
    if (rebuilt.trim()) keptBlocks.push(rebuilt);
  }

  const text = keptBlocks.join("\n\n").trim();
  return { text: text || UNVERIFIED_PRICE_NOTE, violations };
}
