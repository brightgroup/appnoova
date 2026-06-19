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

function inferType(values: unknown[]): DataColumnType {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
  if (nonEmpty.length === 0) return "text";
  const allNumeric = nonEmpty.every(v => {
    if (typeof v === "number") return Number.isFinite(v);
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return String(v).trim() !== "" && Number.isFinite(n);
  });
  return allNumeric ? "number" : "text";
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
      const type = inferType(values);
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

export function normalizeRowData(
  raw: Record<string, unknown>,
  columns: DataTableColumn[]
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const col of columns) {
    const val = raw[col.label] ?? raw[col.key] ?? null;
    if (val === null || val === undefined || String(val).trim() === "") {
      out[col.key] = null;
      continue;
    }
    if (col.type === "number") {
      const n = typeof val === "number" ? val : Number(String(val).replace(/[^\d.-]/g, ""));
      out[col.key] = Number.isFinite(n) ? n : null;
    } else if (col.type === "boolean") {
      out[col.key] = Boolean(val);
    } else {
      out[col.key] = String(val).trim();
    }
  }
  return out;
}
