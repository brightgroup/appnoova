import type { DataColumnType, DataTableColumn } from "@/types/data-table";

const FILTERABLE_HINTS = [
  "categoria", "categoría", "category", "tipo", "type", "linea", "línea", "grupo", "familia",
];

const NUMBER_HINTS = ["precio", "price", "costo", "stock", "cantidad_disponible", "disponible"];

export function slugifyColumnKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "columna";
}

function hasLetters(value: string): boolean {
  return /[a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/.test(value);
}

/** Valor numérico puro (sin letras). Rechaza "Tortas" y "16 porciones". */
export function isPureNumericValue(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).trim();
  if (!s || hasLetters(s)) return false;
  const digits = s.replace(/[^\d.,-]/g, "");
  if (!digits) return false;
  const n = Number(digits.replace(/,/g, "."));
  return Number.isFinite(n);
}

function columnLabelLooksNumeric(label: string): boolean {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return NUMBER_HINTS.some(h => normalized.includes(h));
}

function inferType(label: string, values: unknown[]): DataColumnType {
  if (columnLabelLooksNumeric(label)) return "number";

  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
  if (nonEmpty.length === 0) return "text";
  if (nonEmpty.every(isPureNumericValue)) return "number";
  return "text";
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let i = 2;
  while (used.has(key)) {
    key = `${base}_${i}`;
    i++;
  }
  used.add(key);
  return key;
}

export function buildColumnsFromHeaders(
  headers: string[],
  sampleRows: Record<string, unknown>[]
): DataTableColumn[] {
  const used = new Set<string>();
  return headers
    .filter(h => String(h).trim())
    .map(header => {
      const label = String(header).trim();
      const baseKey = slugifyColumnKey(label);
      const key = uniqueKey(baseKey, used);
      const values = sampleRows.map(r => r[label]);
      const type = inferType(label, values);
      const normalized = label.toLowerCase();
      const filterable = FILTERABLE_HINTS.some(h => normalized.includes(h));
      const required = filterable || normalized.includes("producto") || normalized.includes("nombre");

      return {
        key,
        label,
        type,
        filterable,
        display: true,
        required,
      };
    });
}

export function parseCellValue(
  raw: unknown,
  col: Pick<DataTableColumn, "type">
): string | number | boolean | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  if (col.type === "number") {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (hasLetters(s)) return null;
    const n = Number(s.replace(/[^\d.,-]/g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : null;
  }
  if (col.type === "boolean") return Boolean(raw);
  return String(raw).trim();
}

export function normalizeRowData(
  raw: Record<string, unknown>,
  columns: DataTableColumn[]
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const col of columns) {
    const val = raw[col.label] ?? raw[col.key] ?? null;
    out[col.key] = parseCellValue(val, col);
  }
  return out;
}
