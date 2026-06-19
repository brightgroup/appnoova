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

export function mergeDataTableContext(agentPrompt: string, catalogText: string | null): string {
  const base = agentPrompt.trim();
  if (!catalogText?.trim()) return base;

  return `${base}

---

## CATÁLOGO DE PRODUCTOS (FUENTE AUTORIZADA)
Usa EXCLUSIVAMENTE estos datos para precios, productos, cantidades, categorías y stock.
Nunca inventes ni calcules precios. Si algo no está aquí, dilo con honestidad.

${catalogText.trim()}`;
}
