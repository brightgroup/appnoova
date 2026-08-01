import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";

/** Catálogo completo en prompt (sin búsqueda previa). */
export const FULL_CATALOG_MAX_ROWS = 150;

/** Límite operativo para tablas importadas (Excel). Más allá → integración API. */
export const MAX_SUPPORTED_TABLE_ROWS = 1000;

/** Máximo de filas enviadas a la IA por consulta en tablas grandes. */
export const MAX_ROWS_PER_QUERY = 60;

/** Máximo al filtrar por categoría. */
export const MAX_CATEGORY_ROWS = 100;

/**
 * Máximo de filas añadidas por la segunda pasada de cobertura (ver
 * `addUncoveredMatches`), cuando el cliente pregunta por más de un producto en
 * un mismo mensaje.
 */
export const MAX_SECOND_PASS_ROWS = 12;

const CODE_COLUMN_HINTS = [
  "sku", "codigo", "código", "code", "referencia", "ref", "ean", "barcode", "plu", "item",
];

const NAME_COLUMN_HINTS = ["producto", "nombre", "name", "articulo", "artículo", "descripcion", "descripción"];

const STOP_WORDS = new Set([
  "que", "qué", "cual", "cuál", "cuanto", "cuánto", "cuesta", "cuestan", "precio", "precios",
  "del", "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "por", "para", "con", "sin",
  "hay", "tienen", "tengo", "tiene", "quiero", "necesito", "saber", "dime", "sobre", "mas", "más",
  "muy", "es", "en", "al", "se", "me", "te", "le", "hola", "buenas", "buenos", "dias", "días",
  "tarde", "noche", "favor", "gracias", "producto", "productos", "catalogo", "catálogo", "menu",
  "menú", "opciones", "venden", "tienen", "está", "esta", "este", "ese", "esa", "aqui", "aquí",
  "como", "cómo", "donde", "dónde", "cuando", "cuándo", "hacer", "pedir", "pedido", "comprar",
  "tardes", "noches", "dias", "mañana", "manana", "saludos", "hey",
]);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function colNormalized(col: DataTableColumn): string {
  return normalizeText(`${col.label} ${col.key}`);
}

export function getPrimaryFilterColumn(columns: DataTableColumn[]): DataTableColumn | undefined {
  return columns.find(c => c.filterable) ?? columns.find(c => {
    const n = colNormalized(c);
    return n.includes("categoria") || n.includes("category");
  });
}

export function getNameColumn(columns: DataTableColumn[]): DataTableColumn | undefined {
  return columns.find(c => NAME_COLUMN_HINTS.some(h => colNormalized(c).includes(h)));
}

export function getCodeColumns(columns: DataTableColumn[]): DataTableColumn[] {
  return columns.filter(c => CODE_COLUMN_HINTS.some(h => colNormalized(c).includes(h)));
}

function distinctValues(rows: DataTableRowRecord[], col: DataTableColumn): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row.data[col.key];
    if (v != null && String(v).trim()) set.add(String(v).trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Umbral de longitud para no confundir una pregunta corta y directa
 * ("¿qué categorías tienen?") con un mensaje largo que solo MENCIONA esas
 * palabras de pasada — típicamente la descripción automática de una imagen
 * (ej. "...la app muestra opciones de navegación como 'Catálogo' y 'Mi
 * cuenta'..."), que puede tener cientos de caracteres describiendo la
 * interfaz de una captura de pantalla sin que el cliente esté pidiendo ver
 * categorías. Sin este tope, ese texto disparaba la rama de "aquí están
 * las categorías" y se perdía por completo el producto real que el cliente
 * pedía (incluida su fila con el precio correcto).
 */
const CATEGORY_INTENT_MAX_LENGTH = 150;

function wantsCategories(message: string): boolean {
  if (message.length > CATEGORY_INTENT_MAX_LENGTH) return false;
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
  let best: string | null = null;
  let bestLen = 0;
  for (const cat of categories) {
    const n = normalizeText(cat);
    if (n.length >= 3 && m.includes(n) && n.length > bestLen) {
      best = cat;
      bestLen = n.length;
    }
  }
  return best;
}

/** Palabras significativas del mensaje (sin stopwords). */
export function extractSearchTokens(message: string): string[] {
  const tokens = normalizeText(message)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
}

/**
 * Códigos tipo SKU / referencia en el mensaje. El mínimo de 5 caracteres es
 * a propósito: con 2 caracteres, cualquier número corto incidental (una
 * hora "6:16", una batería "38%", "5G") calzaba por coincidencia como
 * subcadena de códigos largos reales (ISBNs de 17 caracteres), inflando el
 * puntaje de decenas de filas sin relación alguna con lo que pedía el
 * cliente — sobre todo en mensajes largos como las descripciones
 * automáticas de imágenes, que mencionan varios números de pasada.
 */
export function extractCodeTokens(message: string): string[] {
  const raw = message.match(/\b[A-Za-z0-9][A-Za-z0-9\-_.]{1,}\b/g) ?? [];
  const codes = raw
    .map(c => c.trim())
    .filter(c => c.length >= 5 && !STOP_WORDS.has(normalizeText(c)));
  return [...new Set(codes)];
}

function rowValuesNormalized(row: DataTableRowRecord, columns: DataTableColumn[]): string {
  return columns
    .map(c => row.data[c.key])
    .filter(v => v != null && String(v).trim())
    .map(v => normalizeText(String(v)))
    .join(" ");
}

interface ScoredRow {
  row: DataTableRowRecord;
  score: number;
  /** Palabras del mensaje que aparecen en la columna de nombre de esta fila. */
  nameHits: string[];
  /**
   * La fila coincide por algo más que palabras sueltas dentro de un texto
   * largo: código/SKU, nombre completo o categoría pedida explícitamente.
   */
  strong: boolean;
}

function scoreRow(
  row: DataTableRowRecord,
  columns: DataTableColumn[],
  message: string,
  tokens: string[],
  codeTokens: string[],
  nameCol: DataTableColumn | undefined,
  codeCols: DataTableColumn[],
  categoryMatch: string | null,
  filterCol: DataTableColumn | undefined
): ScoredRow {
  let score = 0;
  let strong = false;
  let nameHits: string[] = [];
  const msgNorm = normalizeText(message);
  const rowText = rowValuesNormalized(row, columns);

  for (const code of codeTokens) {
    const codeNorm = normalizeText(code);
    for (const col of codeCols) {
      const val = normalizeText(String(row.data[col.key] ?? ""));
      if (!val) continue;
      if (val === codeNorm) {
        score += 1000;
        strong = true;
      } else if (val.includes(codeNorm) || codeNorm.includes(val)) {
        score += 450;
        strong = true;
      }
    }
    if (rowText.includes(codeNorm)) score += 120;
  }

  if (nameCol) {
    const name = normalizeText(String(row.data[nameCol.key] ?? ""));
    if (name) {
      if (name === msgNorm) {
        score += 900;
        strong = true;
      } else if (msgNorm.includes(name)) {
        score += 750;
        strong = true;
      } else if (name.includes(msgNorm) && msgNorm.length >= 6) {
        score += 650;
        strong = true;
      }

      nameHits = tokens.filter(t => name.includes(t));
      score += nameHits.length * 90;
      if (tokens.length >= 2 && nameHits.length === tokens.length) score += 250;
      if (tokens.length === 1 && nameHits.length === 1) score += 150;
    }
  }

  for (const token of tokens) {
    if (rowText.includes(token)) score += 20;
  }

  if (filterCol && categoryMatch) {
    const cat = normalizeText(String(row.data[filterCol.key] ?? ""));
    if (cat === normalizeText(categoryMatch)) {
      score += 300;
      strong = true;
    }
  }

  return { row, score, nameHits, strong };
}

function rowName(row: DataTableRowRecord, nameCol: DataTableColumn | undefined): string {
  if (!nameCol) return "";
  return normalizeText(String(row.data[nameCol.key] ?? ""));
}

/**
 * Segunda pasada: rescata los productos que el cliente nombró en el mismo
 * mensaje pero que la primera pasada descartó por puntaje.
 *
 * Sin esto, un mensaje con dos productos ("info de estos dos: Código Civil
 * Anotado y la Constitución Política Anotada") devolvía UNA sola fila: la
 * coincidencia exacta se lleva ~1.000 puntos y el segundo producto, nombrado
 * de forma parcial, se queda en ~350 — por debajo de cualquier umbral relativo
 * al primero. El modelo se quedaba sin datos reales del segundo producto y se
 * los inventaba (precio, autor, edición) con total confianza.
 *
 * En vez de bajar el umbral (que reintroduce decenas de filas irrelevantes),
 * se mira qué palabras del mensaje NO quedaron cubiertas por el nombre de
 * ninguna fila ya seleccionada y se rescatan solo las filas que cubren el
 * máximo de esas palabras sobrantes.
 */
function addUncoveredMatches(
  selected: ScoredRow[],
  candidates: ScoredRow[],
  tokens: string[],
  nameCol: DataTableColumn | undefined
): ScoredRow[] {
  if (!nameCol || candidates.length === 0) return [];

  const selectedNames = selected.map(s => rowName(s.row, nameCol)).filter(Boolean);
  const uncovered = tokens.filter(
    t => t.length >= 4 && !selectedNames.some(name => name.includes(t))
  );
  if (uncovered.length === 0) return [];

  const rescued = candidates
    .map(c => ({ candidate: c, hits: uncovered.filter(t => rowName(c.row, nameCol).includes(t)) }))
    .filter(r => r.hits.length > 0);
  if (rescued.length === 0) return [];

  const bestHits = Math.max(...rescued.map(r => r.hits.length));
  return rescued
    .filter(r => r.hits.length === bestHits)
    .sort((a, b) => b.candidate.score - a.candidate.score)
    .slice(0, MAX_SECOND_PASS_ROWS)
    .map(r => r.candidate);
}

export interface RowSelectionResult {
  rows: DataTableRowRecord[];
  note?: string;
  /**
   * Ninguna fila coincidió por nombre, código o categoría: el mensaje no nombra
   * ningún producto y lo que se devuelve son, como mucho, coincidencias
   * incidentales de palabras sueltas dentro de reseñas.
   *
   * Quien llama lo usa para rehacer la búsqueda con lo que el cliente pidió en
   * sus mensajes anteriores (ver `buildDataTableContext`). Importa porque estas
   * filas incidentales no son inofensivas: son productos ajenos con precios
   * reales, y el modelo los toma prestados para el producto que sí le pidieron.
   */
  weak: boolean;
}

export function selectRowsForMessage(
  rows: DataTableRowRecord[],
  columns: DataTableColumn[],
  message: string
): RowSelectionResult {
  const active = rows.filter(r => r.is_active);
  if (active.length === 0) return { rows: [], weak: true };

  const filterCol = getPrimaryFilterColumn(columns);
  const nameCol = getNameColumn(columns);
  const codeCols = getCodeColumns(columns);
  const total = active.length;

  if (filterCol && wantsCategories(message)) {
    const cats = distinctValues(active, filterCol);
    if (cats.length > 0) {
      return {
        rows: [],
        note: `Catálogo de ${total} productos. Categorías disponibles: ${cats.join(", ")}.`,
        weak: false,
      };
    }
  }

  // Mismo criterio que wantsCategories: un nombre de categoría que aparece de
  // pasada en un mensaje largo (ej. una migaja de pan "Derecho privado" dentro
  // de la descripción de una captura de pantalla) no es lo mismo que el
  // cliente pidiendo esa categoría — sin este tope se devolvían decenas de
  // filas ajenas en vez de la coincidencia específica del producto real.
  if (filterCol && message.length <= CATEGORY_INTENT_MAX_LENGTH) {
    const cats = distinctValues(active, filterCol);
    const match = findCategoryMatch(message, cats);
    if (match) {
      const filtered = active.filter(
        r => normalizeText(String(r.data[filterCol.key] ?? "")) === normalizeText(match)
      );
      if (filtered.length > 0) {
        const slice = filtered.slice(0, MAX_CATEGORY_ROWS);
        const note =
          filtered.length > MAX_CATEGORY_ROWS
            ? `Categoría «${match}»: ${filtered.length} productos (mostrando ${slice.length}).`
            : `Categoría «${match}»: ${filtered.length} productos.`;
        return { rows: slice, note, weak: false };
      }
    }
  }

  const tokens = extractSearchTokens(message);
  const codeTokens = extractCodeTokens(message);
  const categoryMatch = filterCol
    ? findCategoryMatch(message, distinctValues(active, filterCol))
    : null;

  if (tokens.length === 0 && codeTokens.length === 0) {
    if (filterCol) {
      const cats = distinctValues(active, filterCol);
      if (cats.length > 0) {
        return {
          rows: [],
          note: `Catálogo de ${total} productos en ${cats.length} categorías: ${cats.join(", ")}. Pregunta por un producto, SKU o categoría específica.`,
          weak: true,
        };
      }
    }
    return {
      rows: [],
      note: `Catálogo de ${total} productos. Pregunta por nombre, SKU o categoría.`,
      weak: true,
    };
  }

  const allScored = active
    .map(row =>
      scoreRow(row, columns, message, tokens, codeTokens, nameCol, codeCols, categoryMatch, filterCol)
    )
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Si alguna fila coincide por nombre/código/categoría, las que solo calzan
  // por palabras sueltas dentro de un texto largo (una reseña que menciona
  // "civil" de pasada) son ruido: contaminan el contexto y le dan al modelo
  // productos ajenos con los que confundir el precio del que sí pidieron.
  const relevant = allScored.filter(s => s.nameHits.length > 0 || s.strong);
  const scored = relevant.length > 0 ? relevant : allScored;

  if (scored.length === 0) {
    return {
      rows: [],
      note: `No se encontraron productos que coincidan con la consulta (catálogo: ${total} productos). No inventes datos; pide nombre, SKU o categoría más específica.`,
      weak: true,
    };
  }

  const topScore = scored[0].score;
  let selected: ScoredRow[];

  if (topScore >= 1000) {
    // Tope aplicado siempre, incluso aquí: en mensajes largos (ej. la
    // descripción automática de una imagen, con decenas de palabras sueltas)
    // muchas filas sin relación real pueden acumular +20 por cada palabra
    // genérica que coincide en su reseña y cruzar los 1000 puntos igual que
    // la coincidencia real — sin el tope, esas filas ajenas terminaban
    // todas en el contexto en vez de solo las más relevantes (`scored` ya
    // viene ordenado de mayor a menor, así que el slice conserva las mejores).
    selected = scored.filter(s => s.score >= 1000).slice(0, MAX_ROWS_PER_QUERY);
  } else {
    const threshold = Math.max(topScore * 0.35, 80);
    selected = scored.filter(s => s.score >= threshold).slice(0, MAX_ROWS_PER_QUERY);
  }

  const selectedIds = new Set(selected.map(s => s.row.id));
  const extra = addUncoveredMatches(
    selected,
    scored.filter(s => !selectedIds.has(s.row.id)),
    tokens,
    nameCol
  );
  const finalRows = [...selected, ...extra];

  const note = `Resultados relevantes: ${finalRows.length} de ${total} productos en catálogo.`;

  return { rows: finalRows.map(s => s.row), note, weak: relevant.length === 0 };
}
