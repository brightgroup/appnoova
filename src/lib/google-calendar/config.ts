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

export function googleCalendarRedirectUri(): string {
  return `${getAppBaseUrl()}/api/conectores/google-calendar/callback`;
}

/** Scopes: eventos + lectura de calendario (freebusy) + email para mostrar la cuenta conectada. */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];
