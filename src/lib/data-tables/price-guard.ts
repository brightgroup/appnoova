import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";
import { formatCell } from "@/lib/data-tables/format-context";
import { getNameColumn, normalizeText } from "@/lib/data-tables/search-rows";
import { columnsWithRole, hasRoleMap } from "@/lib/data-tables/column-roles";
import {
  blockOpensWithProductHeading,
  getIdentityColumns,
  resolveNamedRows,
  rowForLineInFamily,
  rowsReferredIn,
} from "@/lib/data-tables/row-match";

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
  // Ver `column-roles.ts`: el mapeo confirmado manda sobre la adivinanza, y su
  // vacío también — una tabla de sedes u horarios no tiene precios que validar.
  if (hasRoleMap(columns)) return columnsWithRole(columns, "price");
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

/** ¿Es exactamente la suma de los subtotales ya validados en este bloque? */
function sumsToExact(value: number, subtotals: number[]): boolean {
  if (!subtotals.length) return false;
  const total = subtotals.reduce((a, b) => a + b, 0);
  return Math.abs(total - value) < 0.01;
}

/** Máximo factor de cantidad que se admite (pedidos al por mayor incluidos). */
const MAX_QUANTITY_FACTOR = 100000;

/**
 * Enteros "sueltos" de la línea — candidatos a ser la cantidad pedida — una
 * vez quitados los importes ya reconocidos (para no leer "230" dentro de
 * "$230.000" como si fuera una cantidad).
 */
function quantityCandidatesIn(line: string): number[] {
  const stripped = line.replace(CURRENCY_AMOUNT_RE, " ").replace(BARE_AMOUNT_RE, " ");
  return [...stripped.matchAll(/\b\d{1,6}\b/g)].map(m => Number(m[0])).filter(n => n > 0);
}

/**
 * Cotizar no es solo citar un precio: es multiplicarlo por una cantidad
 * ("10 cajas × $23.000 = $230.000") y sumar varios productos en un total. El
 * guardián original solo reconocía el precio crudo del catálogo o una suma de
 * hasta 3 importes conocidos — cualquier pedido con cantidad quedaba
 * indistinguible de un precio inventado y se escalaba a un asesor, aunque el
 * cálculo fuera correcto. Esto no depende del cliente ni de configuración
 * alguna: solo de que la línea nombre a UNA fila del catálogo (ver `row`/`col`
 * más abajo) y mencione la cantidad como un número suelto.
 */
function isMultipleOfRowPrice(
  value: number,
  row: DataTableRowRecord | null,
  col: DataTableColumn | undefined,
  line: string
): boolean {
  if (!row || !col) return false;
  const raw = row.data[col.key];
  const unit = typeof raw === "number" ? raw : parseAmount(String(raw ?? ""));
  if (unit === null || unit <= 0 || value <= unit) return false;
  if (value % unit !== 0) return false;
  const factor = value / unit;
  if (!Number.isInteger(factor) || factor < 2 || factor > MAX_QUANTITY_FACTOR) return false;
  return quantityCandidatesIn(line).includes(factor);
}

/**
 * Largo máximo de lo que puede acompañar al importe para dar la línea por
 * "línea de precio de una ficha": una etiqueta corta y poco más ("*Bolsillo:*",
 * "*Precio:*", "El precio es"). Cualquier frase más larga habla de dinero por
 * otro motivo — un envío, un bono, un total — y ahí sí valen los importes que
 * autoriza el prompt.
 */
const PRICE_LINE_LABEL_MAX_LENGTH = 25;

function isProductPriceLine(line: string, amounts: string[]): boolean {
  if (amounts.length !== 1) return false;
  const rest = line
    .replace(amounts[0], " ")
    .replace(/[^a-zA-ZÀ-ÿ0-9]+/g, " ")
    .trim();
  return rest.length <= PRICE_LINE_LABEL_MAX_LENGTH;
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

  // Cuando el texto no nombra ningún producto pero solo hay uno en contexto, se
  // habla de ese. Es el caso de los seguimientos cortos: "precio?" → "$160.000".
  // Sin este respaldo se borraba una respuesta correcta por no poder atribuirla.
  //
  // Este arrastre AVANZA con el texto (el último producto que quedó nombrado),
  // en vez de mirar la respuesta entera. Mirar la respuesta entera es lo que
  // dejó pasar los precios inventados: en un listado de siete productos, el
  // único que sí estaba en el catálogo autorizaba su precio para los bloques de
  // los otros seis, que no lo estaban.
  let carriedRows = rows.length === 1 ? rows : [];

  for (const block of blocks) {
    // Solo por nombre: que en el bloque aparezca el enlace de otro producto no
    // convierte al bloque en ese producto.
    const named = resolveNamedRows(block, rows, nameCol);
    const blockRows = named.rows;
    const family = named.family;
    if (blockRows.length > 0) carriedRows = blockRows;
    // Un bloque que presenta un producto propio y no lo encuentra en el catálogo
    // se queda sin respaldo: no puede tomar prestado el del bloque anterior.
    const inherited =
      blockRows.length === 0 && blockOpensWithProductHeading(block) ? [] : carriedRows;
    // El producto que nombra la propia línea manda sobre el del bloque: en un
    // listado ("Bolsillo: $65.000") cada línea habla de una fila distinta. Con
    // una familia de hermanas, la línea manda si dice cuál es. Si no lo dice,
    // el ámbito es la familia entera: sirve para reconocer un precio que sí
    // existe, pero no para corregir — corregir exige una fila única, y sin
    // ella la línea se cae en vez de salir con el precio de otra presentación.
    //
    // Este cálculo se hace para todo el bloque ANTES de decidir qué se cae y
    // qué se queda, porque una línea sola no basta para ver el patrón: dos
    // presentaciones distintas ("Anotado" y "Comentado") que ninguna dice cuál
    // es, ambas cayendo en el ámbito de familia, con el MISMO precio real de
    // esa familia repetido en las dos, es la firma de un precio inventado que
    // el modelo copió en vez de dar el de cada una — no dos precios que
    // legítimamente coinciden.
    const lines = block.split("\n");
    const lineInfos = lines.map(line => {
      const lineRows = rowsReferredIn(line, rows, nameCol, strongCols);
      const sibling = rowForLineInFamily(line, family, nameCol);
      const isFamilyFallback = lineRows.length === 0 && !sibling && named.ambiguous;
      const scope =
        lineRows.length > 0
          ? lineRows
          : sibling
            ? [sibling]
            : named.ambiguous
              ? family
              : blockRows.length > 0
                ? blockRows
                : inherited;

      // Solo se dan por buenos los precios del producto del que habla este
      // texto (más los importes que el propio prompt autoriza: envíos, bonos).
      // Aceptar cualquier precio del catálogo no sirve de nada: con decenas de
      // filas en contexto, casi cualquier cifra redonda coincidiría con alguna.
      const scopeAmounts = collectRealAmounts(scope, priceCols);
      const includeBare = PRICE_LINE_RE.test(line);
      const lineAmounts = amountsIn(line, includeBare);

      const row = scope.length === 1 ? scope[0] : null;
      const col = row ? priceColumnForLine(line, row, priceCols) : undefined;

      // En la línea de precio de una ficha manda el dato de la fila y solo ese.
      // Los importes que autoriza el prompt (envíos, bonos, suscripciones) son
      // para frases que hablan de dinero por otro motivo; aplicarlos aquí dejaba
      // pasar el precio de otro producto solo porque el prompt lo mencionaba en
      // otro contexto — así salió una Constitución de bolsillo a $25.000.
      const isFichaPrice = Boolean(row && col) && isProductPriceLine(line, lineAmounts);
      const allowSums = TOTAL_LINE_RE.test(line);

      return { line, scope, scopeAmounts, lineAmounts, row, col, isFichaPrice, allowSums, isFamilyFallback };
    });

    // Cuántas líneas distintas del bloque, sin poder decir cuál presentación
    // es cada una, comparten el mismo precio real de la familia.
    const familyAmountLineCounts = new Map<number, number>();
    for (const info of lineInfos) {
      if (!info.isFamilyFallback) continue;
      const uniqueRealAmounts = new Set(
        info.lineAmounts
          .map(parseAmount)
          .filter((v): v is number => v !== null && info.scopeAmounts.has(v))
      );
      for (const value of uniqueRealAmounts) {
        familyAmountLineCounts.set(value, (familyAmountLineCounts.get(value) ?? 0) + 1);
      }
    }
    const duplicatedFamilyAmounts = new Set(
      [...familyAmountLineCounts.entries()].filter(([, count]) => count >= 2).map(([value]) => value)
    );

    const keptLines: string[] = [];
    // Un dato inventado contamina todo su bloque: lo que lo acompaña son datos
    // del mismo producto fantasma (su enlace, su edición, las demás
    // presentaciones), y dejarlos sueltos es lo que hacía llegar al cliente un
    // enlace que no corresponde junto al aviso de que falta el dato.
    let blockPoisoned = false;
    // Subtotales de línea ya validados en ESTE bloque (precio real o cantidad
    // × precio real) — el total que los suma no tiene por qué caber en 3
    // términos del pool de precios crudos (ver `isSumOfKnown`): un pedido de
    // varios productos suma tantos subtotales como líneas tenga.
    const blockSubtotals: number[] = [];

    for (const { line, scopeAmounts, lineAmounts, row, col, isFichaPrice, allowSums, isFamilyFallback } of lineInfos) {
      // Un precio de la familia solo sirve para reconocer UNA presentación. Si
      // ya se repitió en otra línea de la misma familia sin que ninguna diga
      // cuál es cuál, dejó de ser un reconocimiento válido para esta línea.
      const isKnown = (v: number) =>
        !(isFamilyFallback && duplicatedFamilyAmounts.has(v)) &&
        (scopeAmounts.has(v) || (!isFichaPrice && promptAmounts.has(v)));
      const sumPool = [...new Set([...scopeAmounts, ...promptAmounts, ...verifiedInReply])];

      const offenders: string[] = [];
      const acceptedValues: number[] = [];
      for (const raw of lineAmounts) {
        const value = parseAmount(raw);
        if (value === null) continue;
        if (isKnown(value)) {
          acceptedValues.push(value);
          continue;
        }
        if (allowSums && (isSumOfKnown(value, sumPool) || sumsToExact(value, blockSubtotals))) {
          continue; // es el total del bloque, no el subtotal de esta línea
        }
        if (isMultipleOfRowPrice(value, row, col, line)) {
          acceptedValues.push(value);
          continue;
        }
        offenders.push(raw);
      }

      if (offenders.length === 0) {
        // El total de la línea no se guarda como "subtotal" de sí mismo — solo
        // los productos individuales alimentan la suma que valida el total.
        if (!allowSums && acceptedValues.length) blockSubtotals.push(Math.max(...acceptedValues));
        keptLines.push(line);
        continue;
      }

      // Una línea de TOTAL no tiene "su" fila: es la suma de varias. Si ninguna
      // suma cuadró, "corregirla" al precio crudo de la última fila nombrada es
      // un número plausible pero falso — peor que escalar, porque no se nota.
      // Aquí sí se prefiere caer y avisar.
      if (row && col && !allowSums) {
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

      // El precio no tiene respaldo: se cae el bloque entero y en su lugar
      // queda el aviso (una sola vez), para que el mensaje no pierda el hilo.
      blockPoisoned = true;
      for (const offender of offenders) {
        violations.push({ amount: offender, action: "removed" });
      }
      break;
    }

    if (blockPoisoned) {
      if (!removedAny) keptBlocks.push(UNVERIFIED_PRICE_NOTE);
      removedAny = true;
      continue;
    }

    const rebuilt = keptLines.join("\n");
    if (rebuilt.trim()) keptBlocks.push(rebuilt);
  }

  const text = keptBlocks.join("\n\n").trim();
  return { text: text || UNVERIFIED_PRICE_NOTE, violations };
}
