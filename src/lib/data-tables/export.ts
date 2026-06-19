import * as XLSX from "xlsx";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";

function cellValue(value: unknown, col: DataTableColumn): string | number {
  if (value == null || value === "") return "";
  if (col.type === "number" && typeof value === "number") return value;
  return String(value);
}

function safeFileName(name: string): string {
  return name.replace(/[^\w\s-áéíóúñÁÉÍÓÚÑ]/g, "").trim() || "tabla";
}

export function exportDataTableCsv(
  tableName: string,
  columns: DataTableColumn[],
  rows: DataTableRowRecord[]
): void {
  const displayCols = columns.filter(c => c.display);
  const header = displayCols.map(c => c.label);
  const lines = [
    header.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map(row =>
      displayCols
        .map(c => {
          const v = cellValue(row.data[c.key], c);
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(tableName)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportDataTableXlsx(
  tableName: string,
  columns: DataTableColumn[],
  rows: DataTableRowRecord[]
): void {
  const displayCols = columns.filter(c => c.display);
  const sheetRows = rows.map(row => {
    const obj: Record<string, string | number> = {};
    for (const c of displayCols) {
      obj[c.label] = cellValue(row.data[c.key], c);
    }
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${safeFileName(tableName)}.xlsx`);
}
