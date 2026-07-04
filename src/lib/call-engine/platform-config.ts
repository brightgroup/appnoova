import type { adminClient } from "@/lib/voice-agents-server";
import type { ColombiaSpecialEvent } from "@/lib/colombia-calendar";

type Db = ReturnType<typeof adminClient>;

export const CALL_RULES_KEY = "call_engine_rules";
export const TIME_RULES_KEY = "time_rules";

/** Reglas del motor de llamadas de campañas (globales, editables por superadmin). */
export interface CallEngineRules {
  /** Cada cuántos minutos corre el marcador. */
  tick_minutes: number;
  /** Cuántas llamadas se colocan por lote en cada tick. */
  batch_size: number;
  /** Máximo de llamadas simultáneas en curso. */
  max_concurrent: number;
  /** Minutos de espera antes de reintentar un contacto no contestado. */
  retry_gap_minutes: number;
  /** Segundos que suena antes de colgar (no contesta). */
  ring_timeout_seconds: number;
  /** Motor encendido/apagado globalmente. */
  enabled: boolean;
}

export const DEFAULT_CALL_RULES: CallEngineRules = {
  tick_minutes: 20,
  batch_size: 25,
  max_concurrent: 10,
  retry_gap_minutes: 180,
  ring_timeout_seconds: 30,
  enabled: false,
};

/** Reglas de calendario/hora editables (se suman al calendario en código). */
export interface TimeRules {
  extra_events: ColombiaSpecialEvent[];
  extra_notes: string[];
}

export const DEFAULT_TIME_RULES: TimeRules = {
  extra_events: [],
  extra_notes: [],
};

async function readSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const { data, error } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data?.value) return fallback;
  return { ...fallback, ...(data.value as Partial<T>) };
}

export async function getCallEngineRules(db: Db): Promise<CallEngineRules> {
  return readSetting(db, CALL_RULES_KEY, DEFAULT_CALL_RULES);
}

export async function getTimeRules(db: Db): Promise<TimeRules> {
  return readSetting(db, TIME_RULES_KEY, DEFAULT_TIME_RULES);
}

export async function saveSetting(
  db: Db,
  key: string,
  value: unknown,
  updatedBy: string
): Promise<void> {
  await db.from("platform_settings").upsert({
    key,
    value: value as Record<string, unknown>,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  });
}
