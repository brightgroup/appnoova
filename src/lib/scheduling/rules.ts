import { isColombiaHoliday } from "@/lib/colombia-calendar";

/**
 * Agendamiento — dos niveles de configuración:
 *
 * 1. `OrgBusinessHours` (nivel empresa, una sola vez): horario de atención,
 *    anticipación mínima y ventana futura. Vive en `organizations.business_hours`
 *    y se administra en Configuración → Horario de atención. Todos los agentes
 *    de la organización lo comparten — así el cliente lo configura una vez,
 *    como un profesional espera de su agenda de negocio.
 * 2. `SchedulingRules` (nivel agente): solo si ese agente puede agendar,
 *    duración de la cita y buffer entre citas. Vive en `text_agents.scheduling_rules`
 *    / `voice_agents.scheduling_rules`.
 *
 * Zona horaria fija America/Bogota (UTC-5, sin horario de verano), igual
 * que el resto del sistema (`colombia-calendar.ts`).
 */

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDayKey = (typeof WEEK_DAYS)[number];

/** Rango horario del día, formato "HH:mm" (24h, hora Colombia). */
export type TimeRange = [string, string];

export type WeeklyHours = Partial<Record<WeekDayKey, TimeRange[]>>;

// ─────────────────────────────────────────────────────────────────────────
// Nivel empresa — horario de atención (organizations.business_hours)
// ─────────────────────────────────────────────────────────────────────────

export interface OrgBusinessHours {
  weekly_hours: WeeklyHours;
  /** Anticipación mínima para agendar, en minutos (evita citas "ya mismo"). */
  min_notice_min: number;
  /** Ventana máxima hacia el futuro, en días. */
  max_days_ahead: number;
}

const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [],
  sun: []
};

export function defaultOrgBusinessHours(): OrgBusinessHours {
  return {
    weekly_hours: { ...DEFAULT_WEEKLY_HOURS },
    min_notice_min: 60,
    max_days_ahead: 30
  };
}

function isTimeRange(value: unknown): value is TimeRange {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    /^\d{2}:\d{2}$/.test(value[0]) &&
    /^\d{2}:\d{2}$/.test(value[1])
  );
}

function normalizeWeeklyHours(raw: unknown): WeeklyHours {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WEEKLY_HOURS };
  const obj = raw as Record<string, unknown>;
  const out: WeeklyHours = {};
  for (const day of WEEK_DAYS) {
    const ranges = obj[day];
    if (Array.isArray(ranges)) {
      out[day] = ranges.filter(isTimeRange);
    }
  }
  return Object.keys(out).length ? out : { ...DEFAULT_WEEKLY_HOURS };
}

export function normalizeOrgBusinessHours(raw: unknown): OrgBusinessHours {
  const base = defaultOrgBusinessHours();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const minNotice = Number(r.min_notice_min);
  const maxDays = Number(r.max_days_ahead);

  return {
    weekly_hours: normalizeWeeklyHours(r.weekly_hours),
    min_notice_min: Number.isFinite(minNotice) ? Math.min(10080, Math.max(0, minNotice)) : base.min_notice_min,
    max_days_ahead: Number.isFinite(maxDays) ? Math.min(180, Math.max(1, maxDays)) : base.max_days_ahead
  };
}

/** ¿Hay al menos un día con algún rango horario activo? */
export function hasAnyActiveHours(hours: OrgBusinessHours): boolean {
  return WEEK_DAYS.some(d => (hours.weekly_hours[d]?.length ?? 0) > 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Nivel agente — activación + duración/buffer (text_agents.scheduling_rules)
// ─────────────────────────────────────────────────────────────────────────

export interface SchedulingRules {
  enabled: boolean;
  /** Conexión de calendario (calendar_connections.id) que usa este agente. */
  calendar_connection_id: string | null;
  event_duration_min: number;
  buffer_min: number;
  /** Plantilla del título del evento. Variables: {nombre}, {motivo}. */
  event_title_template: string;
}

export function defaultSchedulingRules(): SchedulingRules {
  return {
    enabled: false,
    calendar_connection_id: null,
    event_duration_min: 30,
    buffer_min: 0,
    event_title_template: "Cita: {nombre} — {motivo}"
  };
}

export function normalizeSchedulingRules(raw: unknown): SchedulingRules {
  const base = defaultSchedulingRules();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const duration = Number(r.event_duration_min);
  const buffer = Number(r.buffer_min);

  return {
    enabled: Boolean(r.enabled),
    calendar_connection_id:
      typeof r.calendar_connection_id === "string" && r.calendar_connection_id.trim()
        ? r.calendar_connection_id.trim()
        : null,
    event_duration_min: Number.isFinite(duration) ? Math.min(240, Math.max(5, duration)) : base.event_duration_min,
    buffer_min: Number.isFinite(buffer) ? Math.min(120, Math.max(0, buffer)) : base.buffer_min,
    event_title_template:
      typeof r.event_title_template === "string" && r.event_title_template.trim()
        ? r.event_title_template.trim()
        : base.event_title_template
  };
}

/** Instrucciones inyectadas al system prompt cuando el agendamiento está activo. */
export function buildSchedulingPromptBlock(rules: SchedulingRules): string {
  if (!rules.enabled) return "";

  return `
## Agendamiento de citas (herramientas buscar_horarios_disponibles / crear_cita)
Puedes agendar citas en el calendario real de la empresa. Reglas:
- Antes de ofrecer un horario, DEBES llamar \`buscar_horarios_disponibles\` — nunca inventes ni asumas disponibilidad.
- Ofrece 2-3 opciones concretas de la lista que te devuelva la tool, en lenguaje natural (ej. "martes a las 10:00 am").
- Antes de confirmar, pide y confirma: nombre completo y motivo breve. Pide también el correo electrónico para enviarle la confirmación por ese medio.
- El correo es deseable pero NO obligatorio: si el cliente no lo tiene a la mano o prefiere no darlo (ej. cita presencial en el local), continúa igual sin insistir — agenda la cita solo con nombre y motivo (y teléfono si lo tienes).
- Cuando el cliente confirme el horario, llama \`crear_cita\` con los datos que tengas.
- Si \`crear_cita\` falla (ej. el horario ya se ocupó), dilo con naturalidad y vuelve a \`buscar_horarios_disponibles\`.
- No agendes dos veces la misma cita en la misma conversación.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Cómputo de slots (función pura) + helpers de fecha/hora Bogotá
// ─────────────────────────────────────────────────────────────────────────

/** Convierte una fecha/hora local Colombia (Y-M-D + HH:mm) a instante UTC real (offset fijo -05:00). */
export function bogotaLocalToUtcIso(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00-05:00`).toISOString();
}

function formatBogotaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function bogotaWeekday(date: Date): WeekDayKey {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short"
  }).format(date).toLowerCase();
  const map: Record<string, WeekDayKey> = {
    mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun"
  };
  return map[short.slice(0, 3)] ?? "mon";
}

function addDaysToDateKey(dateKey: string, days: number): string {
  // dateKey es un día calendario Colombia; usamos mediodía UTC-5 para evitar bordes de DST inexistentes aquí.
  const base = new Date(`${dateKey}T12:00:00-05:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return formatBogotaDateKey(base);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export interface BusyInterval {
  start: string; // ISO
  end: string; // ISO
}

export interface CandidateSlot {
  /** Instante UTC (ISO) de inicio del slot. */
  startIso: string;
  endIso: string;
  /** Etiqueta legible en español, hora Colombia (ej. "martes 12 de agosto, 10:00 am"). */
  label: string;
}

const SLOT_LABEL_FORMAT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

/**
 * Cruza el horario de atención de la empresa + duración/buffer del agente
 * con el free/busy real de Google Calendar y devuelve los próximos horarios
 * válidos. Función pura (sin I/O) — testeable de forma aislada.
 */
export function computeCandidateSlots(
  businessHours: OrgBusinessHours,
  agentRules: Pick<SchedulingRules, "event_duration_min" | "buffer_min">,
  busy: BusyInterval[],
  fromDate: Date = new Date(),
  opts: { maxResults?: number; skipHolidays?: boolean } = {}
): CandidateSlot[] {
  const maxResults = opts.maxResults ?? 6;
  const skipHolidays = opts.skipHolidays ?? true;
  const duration = agentRules.event_duration_min;
  const buffer = agentRules.buffer_min;
  const earliestStart = new Date(fromDate.getTime() + businessHours.min_notice_min * 60_000);

  const busyRanges = busy
    .map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter(b => Number.isFinite(b.start) && Number.isFinite(b.end));

  function overlapsBusy(startMs: number, endMs: number): boolean {
    const paddedStart = startMs - buffer * 60_000;
    const paddedEnd = endMs + buffer * 60_000;
    return busyRanges.some(b => paddedStart < b.end && paddedEnd > b.start);
  }

  const results: CandidateSlot[] = [];
  const dateKey = formatBogotaDateKey(fromDate);

  for (let dayOffset = 0; dayOffset <= businessHours.max_days_ahead && results.length < maxResults; dayOffset++) {
    const day = dayOffset === 0 ? dateKey : addDaysToDateKey(dateKey, dayOffset);
    const dayDate = new Date(`${day}T12:00:00-05:00`);
    if (skipHolidays && isColombiaHoliday(dayDate)) continue;

    const weekday = bogotaWeekday(dayDate);
    const ranges = businessHours.weekly_hours[weekday] ?? [];

    for (const [rangeStart, rangeEnd] of ranges) {
      let cursor = timeToMinutes(rangeStart);
      const rangeEndMin = timeToMinutes(rangeEnd);

      while (cursor + duration <= rangeEndMin && results.length < maxResults) {
        const startIso = bogotaLocalToUtcIso(day, minutesToTime(cursor));
        const startMs = new Date(startIso).getTime();
        const endMs = startMs + duration * 60_000;

        if (startMs >= earliestStart.getTime() && !overlapsBusy(startMs, endMs)) {
          const endIso = new Date(endMs).toISOString();
          results.push({
            startIso,
            endIso,
            label: SLOT_LABEL_FORMAT.format(new Date(startIso))
          });
        }

        cursor += duration;
      }
    }
  }

  return results;
}

export function formatBogotaDateTimeLabel(iso: string): string {
  return SLOT_LABEL_FORMAT.format(new Date(iso));
}

export function renderEventTitle(template: string, vars: { nombre: string; motivo: string }): string {
  return template
    .replace(/\{nombre\}/g, vars.nombre || "Cliente")
    .replace(/\{motivo\}/g, vars.motivo || "Cita");
}
