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

/**
 * Alias por campo, ordenados del más específico al más genérico — importa el orden porque el
 * matching es por substring (ver suggestPolizaColumnMap) y un alias específico debe ganarle a uno
 * genérico cuando ambos calzan en el mismo encabezado (ej. "numero_poliza" debe ganarle a "numero"
 * suelto). Incluye tanto vocabulario suelto en español como los nombres de campo reales de
 * Softseguros (numero_poliza, cliente_nombres, ramo_aseguradora_nombre, etc. — confirmados en vivo
 * el 2026-09-09), porque muchos corredores exportan su Excel directo desde ahí.
 */
const HEADER_ALIASES: Record<PolizaImportField, string[]> = {
  numeroPoliza: [
    "numero_poliza", "numero de poliza", "número de póliza", "no. de poliza", "no. poliza",
    "no poliza", "nro poliza", "nro. poliza", "poliza no", "referencia poliza", "poliza", "póliza"
  ],
  tomador: [
    "nombre_tomador", "nombre del tomador", "nombre tomador", "tomador",
    "cliente_nombres", "nombre del cliente", "nombre cliente", "cliente",
    "nombres y apellidos", "nombre completo", "asegurado", "contratante", "razon social",
    "razón social", "nombre"
  ],
  documento: [
    "cliente_numero_documento", "cedula_tomador", "numero de documento", "número de documento",
    "documento de identidad", "numero documento", "documento", "cedula", "cédula", "nit",
    "identificacion", "identificación", "cc", "no. documento"
  ],
  telefono: [
    "cliente_celular", "numero de celular", "número de celular", "numero celular", "celular",
    "telefono", "teléfono", "whatsapp", "movil", "móvil", "numero de contacto", "número de contacto"
  ],
  aseguradora: [
    "ramo_aseguradora_nombre", "nombre de la aseguradora", "compañia aseguradora", "compañía aseguradora",
    "entidad aseguradora", "aseguradora", "compañia", "compañía", "compania", "cia"
  ],
  ramo: [
    "ramo_nombre", "ramo_global_nombre", "ramo del seguro", "tipo de seguro", "tipo de poliza",
    "tipo de póliza", "linea de negocio", "línea de negocio", "producto", "ramo"
  ],
  vigenciaDesde: [
    "fecha_inicio", "fecha de inicio", "inicio de vigencia", "vigencia desde", "inicio vigencia", "desde"
  ],
  vigenciaHasta: [
    "fecha_fin", "fecha de vencimiento", "fecha de fin", "fin de vigencia", "vigencia hasta",
    "fecha vencimiento", "vencimiento", "vence", "hasta"
  ],
  prima: [
    "valor de la prima", "valor prima", "prima neta", "prima anual", "prima_total", "prima"
  ]
};

/** Orden de resolución: los campos más específicos primero, para que no les "roben" el encabezado los genéricos que procesan después. */
const FIELD_RESOLUTION_ORDER: PolizaImportField[] = [
  "numeroPoliza", "documento", "telefono", "vigenciaDesde", "vigenciaHasta", "prima", "aseguradora", "ramo", "tomador"
];

const REQUIRED_FIELDS: PolizaImportField[] = ["tomador", "aseguradora", "ramo", "vigenciaHasta"];

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * Heurística por substring (no exige igualdad exacta): un encabezado real casi nunca es idéntico
 * a un alias suelto ("Nombre del Tomador" vs. "tomador") — por eso se hace calzar en ambas
 * direcciones (el alias cabe en el encabezado, o el encabezado cabe en el alias). Se procesa en
 * FIELD_RESOLUTION_ORDER (específico → genérico) y cada encabezado usado se descarta para los
 * campos siguientes, para que "Fecha de Inicio" no termine también sugerido como "Vencimiento".
 */
export function suggestPolizaColumnMap(headers: string[]): Record<PolizaImportField, string | null> {
  const map = {} as Record<PolizaImportField, string | null>;
  const normalized = headers.map(h => ({ original: h, norm: normalizeLabel(h) }));
  const used = new Set<string>();

  for (const field of FIELD_RESOLUTION_ORDER) {
    // Los alias también se normalizan (los de Softseguros traen guion_bajo, no espacio) —
    // si no, "fecha_inicio" nunca calza con el encabezado normalizado "fecha inicio".
    const aliases = HEADER_ALIASES[field].map(normalizeLabel);
    let best: { original: string; score: number } | null = null;

    for (const candidate of normalized) {
      if (used.has(candidate.original)) continue;
      for (const alias of aliases) {
        // Solo en una dirección (el encabezado contiene el alias) — la dirección inversa causaba
        // falsos positivos: un encabezado corto y genérico como "Cliente" calzaba dentro de un
        // alias compuesto como "cliente_numero_documento" y se lo robaba a "documento".
        if (candidate.norm !== alias && !candidate.norm.includes(alias)) continue;
        // Alias más largo = más específico = mejor candidato (evita que "nombre" solo gane sobre "nombre del tomador").
        if (!best || alias.length > best.score) best = { original: candidate.original, score: alias.length };
        break;
      }
    }

    map[field] = best?.original ?? null;
    if (best) used.add(best.original);
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
