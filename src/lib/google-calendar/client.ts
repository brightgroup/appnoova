import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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

  try {
    const refreshed = await refreshGoogleAccessToken(conn.refreshToken);
    await updateCalendarConnectionAccessToken(db, conn.id, refreshed.accessToken, refreshed.expiresInSec);
    return refreshed.accessToken;
  } catch (err) {
    // Típico en modo Prueba de Google: el refresh_token vence a los 7 días y hay que reconectar.
    const message = err instanceof Error ? err.message : "Error renovando el token de Google";
    await markCalendarConnectionError(db, conn, message);
    throw err;
  }
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
    await markCalendarConnectionError(db, conn, message);
    throw new Error(message);
  }

  return json.calendars?.[conn.calendarId]?.busy ?? [];
}

export interface CreateCalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  /** Si es true, pide a Google que genere una reunión de Meet asociada al evento. */
  createMeetLink?: boolean;
  /** Si se pasa, se agrega como invitado del evento — Google le manda el correo de invitación nativo (con el link de Meet si aplica). */
  attendeeEmail?: string | null;
}

export interface CreateCalendarEventResult {
  id: string;
  htmlLink: string | null;
  /** Link de Google Meet, solo si `createMeetLink` se pidió y Google lo generó. */
  meetLink: string | null;
}

export async function createCalendarEvent(
  db: SupabaseClient,
  conn: CalendarConnectionSecrets,
  input: CreateCalendarEventInput
): Promise<CreateCalendarEventResult> {
  const query = new URLSearchParams();
  if (input.createMeetLink) query.set("conferenceDataVersion", "1");
  if (input.attendeeEmail) query.set("sendUpdates", "all");
  const path = `/calendars/${encodeURIComponent(conn.calendarId)}/events${query.size ? `?${query}` : ""}`;

  const res = await googleCalendarFetch(db, conn, path, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? "",
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
      ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
      ...(input.createMeetLink
        ? {
            conferenceData: {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" }
              }
            }
          }
        : {})
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
    error?: { message?: string };
  };

  if (!res.ok || !json.id) {
    const message = json.error?.message || `Google events.insert error ${res.status}`;
    await markCalendarConnectionError(db, conn, message);
    throw new Error(message);
  }

  const meetLink =
    json.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri ?? null;

  return { id: json.id, htmlLink: json.htmlLink ?? null, meetLink };
}
