/**
 * Importación del Excel de cartera de pólizas — calcada de src/lib/erp/import.ts
 * (mismo criterio: solo la primera hoja, heurística de encabezados en
 * español, el usuario confirma/corrige el mapeo antes de crear nada).
 */
import * as XLSX from "xlsx";

export type PolizaImportField =
  | "tomador"
  | "documento"
  | "telefono"
  | "aseguradora"
  | "ramo"
  | "numeroPoliza"
  | "vigenciaDesde"
  | "vigenciaHasta"
  | "prima";

const HEADER_ALIASES: Record<PolizaImportField, string[]> = {
  tomador: ["tomador", "cliente", "nombre", "asegurado", "contratante"],
  documento: ["documento", "cedula", "cédula", "nit", "identificacion", "identificación"],
  telefono: ["telefono", "teléfono", "celular", "whatsapp", "movil", "móvil"],
  aseguradora: ["aseguradora", "compañia", "compañía", "compania"],
  ramo: ["ramo", "producto", "tipo de poliza", "tipo de póliza"],
  numeroPoliza: ["numero de poliza", "número de póliza", "poliza", "póliza", "no. poliza", "no poliza"],
  vigenciaDesde: ["vigencia desde", "inicio vigencia", "fecha inicio", "desde"],
  vigenciaHasta: ["vigencia hasta", "vence", "fecha vencimiento", "vencimiento", "hasta"],
  prima: ["prima", "valor prima", "valor", "prima anual"]
};

const REQUIRED_FIELDS: PolizaImportField[] = ["tomador", "aseguradora", "ramo", "vigenciaHasta"];

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

export interface ParsedPolizasWorkbook {
  headers: string[];
  rows: Record<string, string>[];
}

export function parsePolizasWorkbook(buffer: ArrayBuffer): ParsedPolizasWorkbook {
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

export function suggestPolizaColumnMap(headers: string[]): Record<PolizaImportField, string | null> {
  const map = {} as Record<PolizaImportField, string | null>;
  for (const field of Object.keys(HEADER_ALIASES) as PolizaImportField[]) {
    map[field] = headers.find(h => HEADER_ALIASES[field].includes(normalizeLabel(h))) ?? null;
  }
  return map;
}

export type PolizaColumnMap = Partial<Record<PolizaImportField, string>>;

export interface NormalizedPolizaRow {
  rowNumber: number;
  tomador: string;
  documento: string | null;
  telefono: string | null;
  aseguradora: string;
  ramo: string;
  numeroPoliza: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string;
  prima: number | null;
}

export interface PolizaImportReport {
  valid: NormalizedPolizaRow[];
  missingRequired: { rowNumber: number; faltantes: PolizaImportField[] }[];
  invalidDates: { rowNumber: number; valor: string; campo: "vigenciaDesde" | "vigenciaHasta" }[];
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Excel guarda fechas como serial (días desde 1899-12-30) cuando la celda tiene formato de fecha. */
function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/** Acepta dd/mm/aaaa, aaaa-mm-dd o el serial numérico de Excel. Devuelve null si no reconoce el formato. */
function toISODate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = excelSerialToISO(Number(trimmed));
    if (serial) return serial;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Normaliza filas crudas según el mapeo confirmado. No aborta ante datos
 * sucios — reporta las filas con problemas por separado y sigue con las
 * válidas, mismo criterio que normalizeInventoryRows.
 */
export function normalizePolizaRows(
  rows: Record<string, string>[],
  columnMap: PolizaColumnMap
): PolizaImportReport {
  for (const field of REQUIRED_FIELDS) {
    if (!columnMap[field]) throw new Error(`Falta mapear la columna para "${field}"`);
  }

  const valid: NormalizedPolizaRow[] = [];
  const missingRequired: { rowNumber: number; faltantes: PolizaImportField[] }[] = [];
  const invalidDates: { rowNumber: number; valor: string; campo: "vigenciaDesde" | "vigenciaHasta" }[] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const get = (field: PolizaImportField) => (columnMap[field] ? row[columnMap[field]!]?.trim() ?? "" : "");

    const tomador = get("tomador");
    const aseguradora = get("aseguradora");
    const ramo = get("ramo");
    const vigenciaHastaRaw = get("vigenciaHasta");

    const faltantes: PolizaImportField[] = [];
    if (!tomador) faltantes.push("tomador");
    if (!aseguradora) faltantes.push("aseguradora");
    if (!ramo) faltantes.push("ramo");
    if (!vigenciaHastaRaw) faltantes.push("vigenciaHasta");
    if (faltantes.length > 0) {
      missingRequired.push({ rowNumber, faltantes });
      return;
    }

    const vigenciaHasta = toISODate(vigenciaHastaRaw);
    if (!vigenciaHasta) {
      invalidDates.push({ rowNumber, valor: vigenciaHastaRaw, campo: "vigenciaHasta" });
      return;
    }

    const vigenciaDesdeRaw = get("vigenciaDesde");
    let vigenciaDesde: string | null = null;
    if (vigenciaDesdeRaw) {
      vigenciaDesde = toISODate(vigenciaDesdeRaw);
      if (!vigenciaDesde) {
        invalidDates.push({ rowNumber, valor: vigenciaDesdeRaw, campo: "vigenciaDesde" });
        return;
      }
    }

    valid.push({
      rowNumber,
      tomador,
      documento: get("documento") || null,
      telefono: get("telefono") || null,
      aseguradora,
      ramo,
      numeroPoliza: get("numeroPoliza") || null,
      vigenciaDesde,
      vigenciaHasta,
      prima: toNumberOrNull(get("prima"))
    });
  });

  return { valid, missingRequired, invalidDates };
}
