import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGoogleAccessToken } from "@/lib/google-calendar/oauth";
import {
  markCalendarConnectionError,
  updateCalendarConnectionAccessToken,
  type CalendarConnectionSecrets
} from "@/lib/google-calendar/connections-db";
import type { BusyInterval } from "@/lib/scheduling/rules";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Devuelve un access_token válido, refrescándolo (y persistiéndolo) si ya expiró o está por expirar. */
async function withFreshAccessToken(
  db: SupabaseClient,
  conn: CalendarConnectionSecrets
): Promise<string> {
  const expiresAtMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (expiresAtMs - Date.now() > 60_000) return conn.accessToken;

  const refreshed = await refreshGoogleAccessToken(conn.refreshToken);
  await updateCalendarConnectionAccessToken(db, conn.id, refreshed.accessToken, refreshed.expiresInSec);
  return refreshed.accessToken;
}

async function googleCalendarFetch(
  db: SupabaseClient,
  conn: CalendarConnectionSecrets,
  path: string,
  init: RequestInit
): Promise<Response> {
  const accessToken = await withFreshAccessToken(db, conn);
  return fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

/** Free/busy real del calendario conectado, en el rango [timeMinIso, timeMaxIso). */
export async function getFreeBusy(
  db: SupabaseClient,
  conn: CalendarConnectionSecrets,
  timeMinIso: string,
  timeMaxIso: string
): Promise<BusyInterval[]> {
  const res = await googleCalendarFetch(db, conn, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: conn.calendarId }]
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    calendars?: Record<string, { busy?: BusyInterval[]; errors?: unknown[] }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const message = json.error?.message || `Google freeBusy error ${res.status}`;
    await markCalendarConnectionError(db, conn.id, message);
    throw new Error(message);
  }

  return json.calendars?.[conn.calendarId]?.busy ?? [];
}

export interface CreateCalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
}

export interface CreateCalendarEventResult {
  id: string;
  htmlLink: string | null;
}

export async function createCalendarEvent(
  db: SupabaseClient,
  conn: CalendarConnectionSecrets,
  input: CreateCalendarEventInput
): Promise<CreateCalendarEventResult> {
  const res = await googleCalendarFetch(
    db,
    conn,
    `/calendars/${encodeURIComponent(conn.calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description ?? "",
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso }
      })
    }
  );

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.id) {
    const message = json.error?.message || `Google events.insert error ${res.status}`;
    await markCalendarConnectionError(db, conn.id, message);
    throw new Error(message);
  }

  return { id: json.id, htmlLink: json.htmlLink ?? null };
}
