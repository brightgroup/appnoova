/**
 * Rango de fechas compartido por los filtros de Inbox y CRM: presets "últimos N días"
 * más un rango personalizado. Vive aparte de cada pantalla para que ambas usen los
 * mismos límites (y las mismas etiquetas) sin duplicar la aritmética de fechas.
 */

export type DateRangePreset = "all" | "8" | "15" | "30" | "60" | "90" | "custom";

export interface DateRangeValue {
  preset: DateRangePreset;
  /** yyyy-mm-dd — solo se usa con preset "custom". */
  from: string;
  /** yyyy-mm-dd — solo se usa con preset "custom". */
  to: string;
}

export const DATE_RANGE_ALL: DateRangeValue = { preset: "all", from: "", to: "" };

export const DATE_RANGE_PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "Cualquier fecha" },
  { value: "8", label: "Últimos 8 días" },
  { value: "15", label: "Últimos 15 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "60", label: "Últimos 60 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "custom", label: "Personalizado" }
];

/** Un rango "custom" sin ninguna fecha escrita todavía no filtra nada. */
export function isDateRangeActive(value: DateRangeValue): boolean {
  if (value.preset === "all") return false;
  if (value.preset === "custom") return Boolean(value.from || value.to);
  return true;
}

function startOfLocalDay(yyyymmdd: string): number | null {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfLocalDay(yyyymmdd: string): number | null {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Límites en milisegundos (null = sin tope por ese lado). Los presets cuentan días
 * completos hacia atrás desde hoy: "últimos 8 días" arranca a las 00:00 de hace 7
 * días, de modo que hoy siempre cuenta como uno de los 8.
 */
export function resolveDateRangeBounds(value: DateRangeValue): { fromMs: number | null; toMs: number | null } {
  if (value.preset === "all") return { fromMs: null, toMs: null };

  if (value.preset === "custom") {
    return {
      fromMs: value.from ? startOfLocalDay(value.from) : null,
      toMs: value.to ? endOfLocalDay(value.to) : null
    };
  }

  const days = Number(value.preset);
  if (!Number.isFinite(days) || days <= 0) return { fromMs: null, toMs: null };

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return { fromMs: start.getTime(), toMs: null };
}

export function dateRangeMatches(value: DateRangeValue, iso: string | null | undefined): boolean {
  if (!isDateRangeActive(value)) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const { fromMs, toMs } = resolveDateRangeBounds(value);
  if (fromMs !== null && t < fromMs) return false;
  if (toMs !== null && t > toMs) return false;
  return true;
}

/** Los mismos límites como ISO, para mandarlos a una API que filtra en la base. */
export function dateRangeQueryParams(value: DateRangeValue): { from?: string; to?: string } {
  const { fromMs, toMs } = resolveDateRangeBounds(value);
  const params: { from?: string; to?: string } = {};
  if (fromMs !== null) params.from = new Date(fromMs).toISOString();
  if (toMs !== null) params.to = new Date(toMs).toISOString();
  return params;
}

/** Etiqueta corta para mostrar el rango activo (chip / resumen del filtro). */
export function dateRangeLabel(value: DateRangeValue): string {
  if (!isDateRangeActive(value)) return "Cualquier fecha";
  if (value.preset !== "custom") {
    return DATE_RANGE_PRESET_OPTIONS.find(o => o.value === value.preset)?.label ?? "Cualquier fecha";
  }
  if (value.from && value.to) return `${value.from} → ${value.to}`;
  if (value.from) return `Desde ${value.from}`;
  return `Hasta ${value.to}`;
}
