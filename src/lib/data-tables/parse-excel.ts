import * as XLSX from "xlsx";
import { buildColumnsFromHeaders, normalizeRowData } from "@/lib/data-tables/columns";
import type { DataTableColumn } from "@/types/data-table";

export interface ParsedExcelTable {
  sheetName: string;
  headers: string[];
  columns: DataTableColumn[];
  rows: Record<string, string | number | boolean | null>[];
  suggestedName: string;
}

function findHeaderRowIndex(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter(c => String(c ?? "").trim() !== "");
    if (nonEmpty.length < 2) continue;
    const next = matrix[i + 1];
    if (Array.isArray(next) && next.some(c => String(c ?? "").trim() !== "")) return i;
  }
  return 0;
}

function matrixToObjects(matrix: unknown[][], headerRowIndex: number): Record<string, unknown>[] {
  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(h => String(h ?? "").trim());

  return matrix
    .slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(c => String(c ?? "").trim() !== ""))
    .map(row => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        const label = headers[i];
        if (!label) continue;
        obj[label] = (row as unknown[])[i] ?? "";
      }
      return obj;
    });
}

export function parseExcelBuffer(buffer: ArrayBuffer, fileName?: string): ParsedExcelTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas");

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (matrix.length === 0) throw new Error("La hoja está vacía");

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headerRow = matrix[headerRowIndex] ?? [];
  const headers = headerRow.map(h => String(h ?? "").trim()).filter(Boolean);
  if (headers.length === 0) throw new Error("No se encontraron columnas");

  const rawRows = matrixToObjects(matrix, headerRowIndex);
  if (rawRows.length === 0) throw new Error("No se encontraron filas de datos");

  const columns = buildColumnsFromHeaders(headers, rawRows.slice(0, 20));
  const rows = rawRows.map(r => normalizeRowData(r, columns));

  const baseName = fileName
    ? fileName.replace(/\.(xlsx|xls|csv)$/i, "").trim()
    : sheetName.trim();

  return {
    sheetName,
    headers,
    columns,
    rows,
    suggestedName: baseName || "Catálogo",
  };
}
