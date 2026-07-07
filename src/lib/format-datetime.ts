const BOGOTA_TZ = "America/Bogota";
const LOCALE = "es-CO";

/** YYYY-MM-DD en zona horaria de Colombia (estable SSR/cliente). */
export function bogotaDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Resta días a una clave YYYY-MM-DD (calendario local, sin DST ambiguo). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

export function formatDatetimeCol(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BOGOTA_TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatDateCol(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BOGOTA_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatScheduledCol(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: BOGOTA_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Próxima llamada en tabla de audiencia — oculta horas pasadas si aún está en cola. */
export function formatNextCallCol(
  iso: string | null,
  callStatus: string
): string {
  const queued = callStatus === "pending" || callStatus === "retry";
  if (!iso) return queued ? "Inmediata" : "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (queued && d.getTime() <= Date.now()) return "Inmediata";
  return formatScheduledCol(iso);
}
