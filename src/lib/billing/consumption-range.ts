export type ConsumptionRangeId =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "month"
  | "last_month";

export const CONSUMPTION_RANGE_OPTIONS: { id: ConsumptionRangeId; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
];

export interface ConsumptionDateRange {
  id: ConsumptionRangeId;
  label: string;
  from: string;
  to: string;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Rango [from, to) en ISO — `to` es exclusivo (inicio del día siguiente). */
export function resolveConsumptionRange(rangeId: string): ConsumptionDateRange {
  const now = new Date();
  const id = (CONSUMPTION_RANGE_OPTIONS.some((o) => o.id === rangeId)
    ? rangeId
    : "30d") as ConsumptionRangeId;

  switch (id) {
    case "today": {
      const from = startOfDay(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { id, label: "Hoy", from: from.toISOString(), to: to.toISOString() };
    }
    case "yesterday": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 1);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { id, label: "Ayer", from: from.toISOString(), to: to.toISOString() };
    }
    case "7d": {
      const to = new Date(startOfDay(now));
      to.setDate(to.getDate() + 1);
      const from = new Date(to);
      from.setDate(from.getDate() - 7);
      return { id, label: "Últimos 7 días", from: from.toISOString(), to: to.toISOString() };
    }
    case "30d": {
      const to = new Date(startOfDay(now));
      to.setDate(to.getDate() + 1);
      const from = new Date(to);
      from.setDate(from.getDate() - 30);
      return { id, label: "Últimos 30 días", from: from.toISOString(), to: to.toISOString() };
    }
    case "90d": {
      const to = new Date(startOfDay(now));
      to.setDate(to.getDate() + 1);
      const from = new Date(to);
      from.setDate(from.getDate() - 90);
      return { id, label: "Últimos 90 días", from: from.toISOString(), to: to.toISOString() };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { id, label: "Este mes", from: from.toISOString(), to: to.toISOString() };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      return { id, label: "Mes pasado", from: from.toISOString(), to: to.toISOString() };
    }
    default:
      return resolveConsumptionRange("30d");
  }
}
