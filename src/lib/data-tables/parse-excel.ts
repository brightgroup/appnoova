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

export function parseExcelBuffer(buffer: ArrayBuffer, fileName?: string): ParsedExcelTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas");

  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (rawRows.length === 0) throw new Error("La hoja está vacía");

  const headers = Object.keys(rawRows[0] ?? {}).filter(h => String(h).trim());
  if (headers.length === 0) throw new Error("No se encontraron columnas");

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
