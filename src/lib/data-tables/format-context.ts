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

  const header = displayCols.map(c => c.label).join(" | ");
  const sep = displayCols.map(() => "---").join(" | ");
  const lines = rows.map(row => {
    return displayCols.map(c => formatCell(row.data[c.key], c)).join(" | ");
  });

  return `| ${header} |\n| ${sep} |\n${lines.map(l => `| ${l} |`).join("\n")}`;
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
5. Si la tabla está vacía o no aplica a la pregunta, indica que no hay información en el catálogo y ofrece contactar a un asesor humano.`;

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
