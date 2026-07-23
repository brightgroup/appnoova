import { getAppBaseUrl } from "@/lib/telephony/app-url";

export function getGoogleCalendarClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID?.trim() || null;
}

export function getGoogleCalendarClientSecret(): string | null {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || null;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getGoogleCalendarClientId() && getGoogleCalendarClientSecret());
}

/** Cuenta de Workspace de Noova que suplanta la cuenta de servicio para crear/compartir calendarios "hosted". */
export function getHostedCalendarOwnerEmail(): string | null {
  return process.env.GOOGLE_CALENDAR_HOSTED_OWNER_EMAIL?.trim() || null;
}

export function googleCalendarRedirectUri(): string {
  return `${getAppBaseUrl()}/api/conectores/google-calendar/callback`;
}

/**
 * Scopes: eventos (crear citas) + freebusy (solo consultar disponibilidad,
 * nunca leemos el detalle de los eventos) + email para mostrar la cuenta
 * conectada. `calendar.freebusy` es más angosto que `calendar.readonly` —
 * coincide exactamente con lo único que usamos (`getFreeBusy`), lo que
 * simplifica la justificación ante la revisión de Google.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/userinfo.email"
];
