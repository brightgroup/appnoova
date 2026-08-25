/**
 * Importación del Excel de inventario (maestro de productos) — lógica propia,
 * no el mapeo de roles de src/lib/data-tables/ (ese es para el catálogo que
 * lee el agente de IA, un dominio distinto). Solo lee la primera hoja del
 * archivo, que en el Excel del cliente es el listado de productos; el
 * histórico de movimientos (segunda hoja) no se migra — ver plan aprobado.
 */
import * as XLSX from "xlsx";

export type InventoryImportField = "codigo" | "nombre" | "marca" | "responsable" | "stockMinimo" | "existencia";

const HEADER_ALIASES: Record<InventoryImportField, string[]> = {
  codigo: ["codigo", "código", "code", "sku", "referencia"],
  nombre: ["producto", "nombre", "descripcion", "descripción"],
  marca: ["marca", "brand"],
  responsable: ["responsable", "encargado"],
  stockMinimo: ["stock minimo", "stock mínimo", "minimo", "mínimo", "stock de seguridad"],
  existencia: ["existencia actual", "existencia", "cantidad actual", "stock actual"]
};

const REQUIRED_FIELDS: InventoryImportField[] = ["codigo", "nombre"];

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

export interface ParsedInventoryWorkbook {
  headers: string[];
  /** Filas crudas: header original -> valor como string (sin normalizar aún). */
  rows: Record<string, string>[];
}

export function parseInventoryWorkbook(buffer: ArrayBuffer): ParsedInventoryWorkbook {
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

  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(c => String(c ?? "").trim() !== ""))
    .map(row => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const label = headers[i];
        if (!label) continue;
        obj[label] = String((row as unknown[])[i] ?? "").trim();
      }
      return obj;
    });

  return { headers, rows };
}

/** header original por campo (o null si no se pudo adivinar) — el usuario confirma/corrige en la UI. */
export function suggestInventoryColumnMap(headers: string[]): Record<InventoryImportField, string | null> {
  const map = {} as Record<InventoryImportField, string | null>;
  for (const field of Object.keys(HEADER_ALIASES) as InventoryImportField[]) {
    map[field] = headers.find(h => HEADER_ALIASES[field].includes(normalizeLabel(h))) ?? null;
  }
  return map;
}

export type InventoryColumnMap = Partial<Record<InventoryImportField, string>>;

export interface NormalizedInventoryRow {
  rowNumber: number; // 1-based, sobre las filas de datos (sin contar encabezado)
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  stockMinimo: number | null;
  existencia: number;
}

export interface InventoryImportReport {
  valid: NormalizedInventoryRow[];
  duplicateCodigos: { codigo: string; rows: number[] }[];
  missingCodigo: number[];
  missingNombre: number[];
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza filas crudas según el mapeo de columnas confirmado. No aborta ante
 * datos sucios (códigos duplicados, filas sin código/nombre) — los reporta
 * para que el usuario decida, y sigue con las filas válidas.
 */
export function normalizeInventoryRows(
  rows: Record<string, string>[],
  columnMap: InventoryColumnMap
): InventoryImportReport {
  for (const field of REQUIRED_FIELDS) {
    if (!columnMap[field]) throw new Error(`Falta mapear la columna para "${field}"`);
  }

  const valid: NormalizedInventoryRow[] = [];
  const missingCodigo: number[] = [];
  const missingNombre: number[] = [];
  const seenCodigos = new Map<string, number[]>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const codigo = (columnMap.codigo ? row[columnMap.codigo] : "").trim();
    const nombre = (columnMap.nombre ? row[columnMap.nombre] : "").trim();

    if (!codigo) {
      missingCodigo.push(rowNumber);
      return;
    }
    if (!nombre) {
      missingNombre.push(rowNumber);
      return;
    }

    const key = codigo.toLowerCase();
    const existingRows = seenCodigos.get(key);
    if (existingRows) {
      existingRows.push(rowNumber);
      return; // se queda con la primera fila de este código; las siguientes se reportan como duplicadas
    }
    seenCodigos.set(key, [rowNumber]);

    valid.push({
      rowNumber,
      codigo,
      nombre,
      marca: columnMap.marca ? row[columnMap.marca]?.trim() || null : null,
      responsable: columnMap.responsable ? row[columnMap.responsable]?.trim() || null : null,
      stockMinimo: columnMap.stockMinimo ? toNumberOrNull(row[columnMap.stockMinimo]) : null,
      existencia: (columnMap.existencia ? toNumberOrNull(row[columnMap.existencia]) : null) ?? 0
    });
  });

  const duplicateCodigos = [...seenCodigos.entries()]
    .filter(([, rowNumbers]) => rowNumbers.length > 1)
    .map(([codigo, rowNumbers]) => ({ codigo, rows: rowNumbers }));

  return { valid, duplicateCodigos, missingCodigo, missingNombre };
}
