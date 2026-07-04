/**
 * Calendario Colombia para agentes de voz/texto.
 *
 * Para eventos puntuales (campañas, cierres, ferias), edita COLOMBIA_SPECIAL_EVENTS
 * o define COLOMBIA_CALENDAR_NOTES en .env (JSON array de strings).
 */

export interface ColombiaSpecialEvent {
  /** YYYY-MM-DD en zona America/Bogota */
  date: string;
  label: string;
}

/** Festivos Colombia — añade el año que necesites (Ley Emiliani ya aplicada). */
export const COLOMBIA_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18",
    "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20",
    "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17",
    "2025-12-08", "2025-12-25",
  ],
  2026: [
    "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
    "2026-05-01", "2026-05-25", "2026-06-15", "2026-06-22", "2026-06-29",
    "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-19", "2026-11-02",
    "2026-11-16", "2026-12-08", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-01-11", "2027-03-22", "2027-03-25", "2027-03-26",
    "2027-05-01", "2027-05-17", "2027-06-07", "2027-06-14", "2027-06-29",
    "2027-07-20", "2027-08-07", "2027-08-16", "2027-10-18", "2027-11-01",
    "2027-11-15", "2027-12-08", "2027-12-25",
  ],
};

/** Eventos especiales editables en código (prioridad sobre festivos genéricos). */
export const COLOMBIA_SPECIAL_EVENTS: ColombiaSpecialEvent[] = [
  // { date: "2026-06-20", label: "Jornada de capacitación interna — atención reducida" },
];

const BOGOTA_TZ = "America/Bogota";

function formatDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseEnvNotes(): string[] {
  const raw = process.env.COLOMBIA_CALENDAR_NOTES?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    return raw.split("|").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export function isColombiaHoliday(date: Date): boolean {
  const key = formatDateKey(date);
  const year = Number(key.slice(0, 4));
  const holidays = COLOMBIA_HOLIDAYS[year] ?? [];
  if (holidays.includes(key)) return true;
  return COLOMBIA_SPECIAL_EVENTS.some(e => e.date === key);
}

export function getColombiaSpecialEventLabel(date: Date): string | null {
  const key = formatDateKey(date);
  return COLOMBIA_SPECIAL_EVENTS.find(e => e.date === key)?.label ?? null;
}

export interface ColombiaTemporalContext {
  fecha_hora_colombia: string;
  dia_semana_colombia: string;
  es_festivo_colombia: string;
  calendario_colombia: string;
  notas_calendario_colombia: string;
  /** Bloque listo para inyectar en prompt (Gemini / fallback). */
  promptBlock: string;
  /** Variables para ElevenLabs dynamicVariables. */
  dynamicVariables: Record<string, string>;
}

export interface TemporalOverrides {
  /** Eventos especiales adicionales (desde configuración de plataforma). */
  extraEvents?: ColombiaSpecialEvent[];
  /** Notas adicionales para hoy (desde configuración de plataforma). */
  extraNotes?: string[];
}

export function buildColombiaTemporalContext(
  now = new Date(),
  overrides: TemporalOverrides = {}
): ColombiaTemporalContext {
  const fecha_hora_colombia = new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  const dia_semana_colombia = new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    weekday: "long",
  }).format(now);

  const isoDate = formatDateKey(now);
  const allSpecialEvents = [...COLOMBIA_SPECIAL_EVENTS, ...(overrides.extraEvents ?? [])];
  const festivo =
    isColombiaHoliday(now) || allSpecialEvents.some(e => e.date === isoDate);
  const special = allSpecialEvents.find(e => e.date === isoDate)?.label ?? null;

  const year = Number(isoDate.slice(0, 4));
  const upcoming = (COLOMBIA_HOLIDAYS[year] ?? [])
    .filter(d => d >= isoDate)
    .slice(0, 4)
    .map(d => {
      const label = allSpecialEvents.find(e => e.date === d)?.label;
      return label ? `${d} (${label})` : d;
    });

  const envNotes = parseEnvNotes();
  const notas = [
    special,
    ...envNotes,
    ...(overrides.extraNotes ?? []),
  ].filter(Boolean).join(" | ") || "Sin notas adicionales para hoy.";

  const es_festivo_colombia = festivo
    ? `Sí — ${special ?? "festivo nacional en Colombia"}`
    : "No";

  const calendario_colombia = upcoming.length
    ? `Próximos festivos: ${upcoming.join(", ")}`
    : "Sin festivos próximos registrados en el calendario interno.";

  const promptBlock = [
    "## Contexto temporal Colombia (OBLIGATORIO — no inventes fecha ni hora)",
    `- Ahora en Colombia (America/Bogota, UTC-5): ${fecha_hora_colombia}`,
    `- Día: ${dia_semana_colombia}`,
    `- ¿Festivo hoy?: ${es_festivo_colombia}`,
    `- Calendario: ${calendario_colombia}`,
    `- Notas del día: ${notas}`,
    "- Si el usuario pregunta la hora o fecha, responde EXACTAMENTE con los valores anteriores.",
  ].join("\n");

  return {
    fecha_hora_colombia,
    dia_semana_colombia,
    es_festivo_colombia,
    calendario_colombia,
    notas_calendario_colombia: notas,
    promptBlock,
    dynamicVariables: {
      fecha_hora_colombia,
      dia_semana_colombia,
      es_festivo_colombia,
      calendario_colombia,
      notas_calendario_colombia: notas,
    },
  };
}

/** Placeholders ElevenLabs — deben coincidir con dynamicVariables en cada sesión. */
export const ELEVENLABS_TEMPORAL_PROMPT_BLOCK = `
## Contexto temporal Colombia (OBLIGATORIO — usa SOLO estos valores inyectados)
- Ahora en Colombia: {{fecha_hora_colombia}}
- Día: {{dia_semana_colombia}}
- ¿Festivo hoy?: {{es_festivo_colombia}}
- Calendario cercano: {{calendario_colombia}}
- Notas del día: {{notas_calendario_colombia}}
- Zona horaria fija: America/Bogota (UTC-5, sin horario de verano).
- Nunca inventes ni estimes la hora: si no está en estas variables, di que verificas el horario de atención.
`;
