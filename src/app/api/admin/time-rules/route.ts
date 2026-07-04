import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  TIME_RULES_KEY,
  DEFAULT_TIME_RULES,
  getTimeRules,
  saveSetting,
  type TimeRules,
} from "@/lib/call-engine/platform-config";
import {
  COLOMBIA_HOLIDAYS,
  COLOMBIA_SPECIAL_EVENTS,
  buildColombiaTemporalContext,
  type ColombiaSpecialEvent,
} from "@/lib/colombia-calendar";

function buildPayload(rules: TimeRules) {
  const temporal = buildColombiaTemporalContext(new Date(), {
    extraEvents: rules.extra_events,
    extraNotes: rules.extra_notes,
  });
  return {
    rules,
    live: {
      fecha_hora_colombia: temporal.fecha_hora_colombia,
      dia_semana_colombia: temporal.dia_semana_colombia,
      es_festivo_colombia: temporal.es_festivo_colombia,
      calendario_colombia: temporal.calendario_colombia,
      notas_calendario_colombia: temporal.notas_calendario_colombia,
      prompt_block: temporal.promptBlock,
    },
    // Reglas definidas en código (solo lectura desde la UI).
    code_holidays: COLOMBIA_HOLIDAYS,
    code_special_events: COLOMBIA_SPECIAL_EVENTS,
    timezone: "America/Bogota (UTC-5, sin horario de verano)",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const rules = await getTimeRules(db);
  return NextResponse.json(buildPayload(rules));
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const events: ColombiaSpecialEvent[] = Array.isArray(body.extra_events)
    ? body.extra_events
        .map((e: unknown) => {
          const ev = e as { date?: unknown; label?: unknown };
          return { date: String(ev.date ?? "").trim(), label: String(ev.label ?? "").trim() };
        })
        .filter((e: ColombiaSpecialEvent) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.label)
    : DEFAULT_TIME_RULES.extra_events;

  const notes: string[] = Array.isArray(body.extra_notes)
    ? body.extra_notes.map((n: unknown) => String(n).trim()).filter(Boolean)
    : DEFAULT_TIME_RULES.extra_notes;

  const next: TimeRules = { extra_events: events, extra_notes: notes };
  await saveSetting(db, TIME_RULES_KEY, next, auth.userId);
  return NextResponse.json(buildPayload(next));
}
