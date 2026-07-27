import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";

function formatCop(value: number): string {
  return "$" + new Intl.NumberFormat("es-CO").format(Math.round(value));
}

function formatCell(value: unknown, col: DataTableColumn): string {
  if (value === null || value === undefined || value === "") return "—";
  if (col.type === "number" && typeof value === "number") {
    const label = col.label.toLowerCase();
    if (label.includes("precio") || label.includes("costo")) return formatCop(value);
    return new Intl.NumberFormat("es-CO").format(value);
  }
  return String(value);
}

export function formatRowsAsCatalog(
  columns: DataTableColumn[],
  rows: DataTableRowRecord[]
): string {
  const displayCols = columns.filter(c => c.display);
  if (displayCols.length === 0 || rows.length === 0) return "";

  const header = ["REF", ...displayCols.map(c => c.label)].join(" | ");
  const sep = ["---", ...displayCols.map(() => "---")].join(" | ");
  const lines = rows.map(row => {
    return [row.id, ...displayCols.map(c => formatCell(row.data[c.key], c))].join(" | ");
  });

  return `| ${header} |\n| ${sep} |\n${lines.map(l => `| ${l} |`).join("\n")}`;
}

/**
 * Ficha de un producto renderizada directamente desde la fila de la base de
 * datos (nunca redactada por la IA), para blindar precio/edición/enlace
 * contra alucinaciones del modelo.
 */
export function renderProductCard(row: DataTableRowRecord, columns: DataTableColumn[]): string {
  const displayCols = columns.filter(c => c.display);
  const lines = displayCols
    .map(c => {
      const value = formatCell(row.data[c.key], c);
      return value === "—" ? null : `*${c.label}:* ${value}`;
    })
    .filter((l): l is string => l !== null);
  return lines.join("\n");
}

const FICHA_TOKEN_RE = /\[\[FICHA:([^\]:]+)(?::([^\]]+))?\]\]/g;

function findColumn(columns: DataTableColumn[], ref: string): DataTableColumn | undefined {
  const norm = ref.trim().toLowerCase();
  return columns.find(c => c.key.toLowerCase() === norm || c.label.toLowerCase() === norm);
}

/**
 * Sustituye cada marcador que el modelo haya escrito por el dato real de esa
 * fila (id -> row), tomado directamente de la base de datos:
 *  - [[FICHA:<REF>]]          -> ficha completa del producto (todas las
 *    columnas visibles).
 *  - [[FICHA:<REF>:<campo>]]  -> solo el valor de esa columna (para cuando
 *    el cliente pide un dato puntual: "solo el precio", "solo el link",
 *    listados de un único campo por fila, etc.). <campo> puede ser el key o
 *    el label de la columna, tal como aparece en el encabezado de la tabla.
 * Un REF o campo que no corresponda a nada realmente recuperado se elimina
 * (nunca se muestra un marcador crudo ni se inventa contenido) — así una
 * referencia fabricada por el modelo simplemente desaparece del mensaje en
 * vez de mostrar datos falsos.
 */
export function resolveProductCards(
  replyText: string,
  rows: DataTableRowRecord[],
  columns: DataTableColumn[]
): string {
  if (!replyText.includes("[[FICHA:")) return replyText;
  const byId = new Map(rows.map(r => [r.id, r]));
  return replyText.replace(FICHA_TOKEN_RE, (_match, ref: string, field?: string) => {
    const row = byId.get(ref.trim());
    if (!row) return "";
    if (!field) return renderProductCard(row, columns);
    const col = findColumn(columns, field);
    if (!col) return "";
    const value = formatCell(row.data[col.key], col);
    return value === "—" ? "" : value;
  });
}

export function mergeDataTableContext(
  agentPrompt: string,
  catalogText: string | null,
  options?: { tableLinked?: boolean }
): string {
  const base = agentPrompt.trim();
  const tableLinked = options?.tableLinked ?? Boolean(catalogText?.trim());

  if (!tableLinked) return base;

  const rules = `## CATÁLOGO / TABLA DE DATOS (ÚNICA FUENTE DE VERDAD)

REGLAS OBLIGATORIAS — cumple siempre:
1. Solo puedes mencionar productos, precios, cantidades, categorías y atributos que aparezcan **literalmente** en la tabla de abajo.
2. Si el cliente pregunta por algo que **no está** en la tabla, dilo con claridad: no tienes ese dato en el catálogo. No inventes alternativas ni precios.
3. **NUNCA** inventes productos, precios, promociones, stock ni disponibilidad.
4. No hagas cálculos de totales ni descuentos salvo sumas simples con números explícitos de la tabla.
5. Si la tabla está vacía o no aplica a la pregunta, indica que no hay información en el catálogo y ofrece contactar a un asesor humano.
6. Cuando muestres los datos de un producto de la tabla (nombre, precio, edición, formato, enlace, código, etc.), **nunca los escribas tú mismo, ni siquiera un solo dato suelto**: usa siempre el marcador correspondiente, con el valor de la columna REF de esa fila copiado tal cual (sin inventarlo ni modificarlo):
   - Si el cliente pide la información completa del producto: [[FICHA:<REF>]] — el sistema lo reemplaza por la ficha completa y exacta.
   - Si el cliente pide solo un dato puntual (solo el precio, solo el link, solo la edición, solo el código, etc.) o pides ese único dato dentro de un listado: [[FICHA:<REF>:<columna>]], usando el nombre exacto de esa columna tal como aparece en el encabezado de la tabla. El sistema lo reemplaza solo por ese valor.
   Nunca uses un REF o una columna que no aparezcan literalmente en la tabla de abajo; si no encuentras la fila o el dato, no pongas marcador — dile al cliente que no tienes esa información.
7. Las reglas anteriores aplican solo a los datos factuales del producto. El resto de tu respuesta (saludo, tono, reseña si la piden, preguntas de seguimiento) lo sigues redactando tú con libertad.`;

  if (!catalogText?.trim()) {
    return `${base}

---

${rules}

(La consulta no encontró filas coincidentes en el catálogo asignado. No inventes datos: indica que no aparece en el catálogo o pide más detalle — nombre, SKU o categoría.)`;
  }

  return `${base}

---

${rules}

${catalogText.trim()}`;
}
