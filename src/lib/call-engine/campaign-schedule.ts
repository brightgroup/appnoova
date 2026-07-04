import type { CampaignScheduleConfig } from "@/types/voice-campaign";
import { CAMPAIGN_DAY_KEYS } from "@/types/voice-campaign";

const WEEKDAY_TO_KEY: Record<string, (typeof CAMPAIGN_DAY_KEYS)[number]> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

function zonedParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday");
  const hour = get("hour") === "24" ? "00" : get("hour");
  const minute = get("minute");

  return {
    dateKey: `${year}-${month}-${day}`,
    dayKey: WEEKDAY_TO_KEY[weekday] ?? "mon",
    timeKey: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  };
}

/** Indica si la campaña está dentro de su ventana de fechas y horario. */
export function isCampaignInSchedule(
  schedule: CampaignScheduleConfig,
  now = new Date()
): boolean {
  const tz = schedule.timezone?.trim() || "America/Bogota";
  const { dateKey, dayKey, timeKey } = zonedParts(now, tz);

  if (schedule.start_date && dateKey < schedule.start_date) return false;
  if (schedule.end_date && dateKey > schedule.end_date) return false;

  const slot = schedule.day_slots?.[dayKey];
  if (!slot?.enabled) return false;

  const start = slot.start?.trim() || "08:00";
  const end = slot.end?.trim() || "18:00";
  return timeKey >= start && timeKey <= end;
}

/** Fecha local (YYYY-MM-DD) en la zona horaria de la campaña. */
export function campaignLocalDateKey(schedule: CampaignScheduleConfig, now = new Date()): string {
  const tz = schedule.timezone?.trim() || "America/Bogota";
  return zonedParts(now, tz).dateKey;
}

export function describeCampaignScheduleNow(
  schedule: CampaignScheduleConfig,
  now = new Date()
): {
  in_schedule: boolean;
  local_time: string;
  local_date: string;
  day_key: string;
  window: string;
  message: string;
} {
  const tz = schedule.timezone?.trim() || "America/Bogota";
  const { dateKey, dayKey, timeKey } = zonedParts(now, tz);
  const slot = schedule.day_slots?.[dayKey];
  const start = slot?.start?.trim() || "08:00";
  const end = slot?.end?.trim() || "18:00";
  const window = `${start} – ${end}`;

  if (schedule.start_date && dateKey < schedule.start_date) {
    return {
      in_schedule: false,
      local_time: timeKey,
      local_date: dateKey,
      day_key: dayKey,
      window,
      message: `La campaña inicia el ${schedule.start_date}.`,
    };
  }
  if (schedule.end_date && dateKey > schedule.end_date) {
    return {
      in_schedule: false,
      local_time: timeKey,
      local_date: dateKey,
      day_key: dayKey,
      window,
      message: `La campaña finalizó el ${schedule.end_date}.`,
    };
  }
  if (!slot?.enabled) {
    return {
      in_schedule: false,
      local_time: timeKey,
      local_date: dateKey,
      day_key: dayKey,
      window,
      message: "Hoy no hay llamadas programadas (día deshabilitado).",
    };
  }
  if (timeKey < start) {
    return {
      in_schedule: false,
      local_time: timeKey,
      local_date: dateKey,
      day_key: dayKey,
      window,
      message: `El marcador arranca hoy a las ${start} (hora ${tz.replace("_", " ")}).`,
    };
  }
  if (timeKey > end) {
    return {
      in_schedule: false,
      local_time: timeKey,
      local_date: dateKey,
      day_key: dayKey,
      window,
      message: `Fuera de horario (${window}). Amplía el horario en Programación o espera a mañana.`,
    };
  }
  return {
    in_schedule: true,
    local_time: timeKey,
    local_date: dateKey,
    day_key: dayKey,
    window,
    message: `En horario de llamadas (${window}).`,
  };
}
