import { createHmac, timingSafeEqual } from "crypto";
import {
  getGoogleCalendarClientId,
  getGoogleCalendarClientSecret,
  googleCalendarRedirectUri,
  GOOGLE_CALENDAR_SCOPES
} from "@/lib/google-calendar/config";

const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export interface GoogleOAuthState {
  organizationId: string;
  userId: string;
}

function stateSecret(): string {
  // Reutiliza la misma clave de cifrado de tokens — evita otra env var solo para firmar el state.
  return process.env.CALENDAR_TOKEN_ENC_KEY?.trim() || "noova-calendar-state-fallback";
}

/** Firma el state (org/user) para que el callback OAuth no dependa de sesión/cookies. */
export function signGoogleOAuthState(state: GoogleOAuthState): string {
  const payload = Buffer.from(JSON.stringify({ ...state, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyGoogleOAuthState(raw: string): GoogleOAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState & {
      ts: number;
    };
    // State válido por 15 minutos (tiempo razonable para completar el consentimiento en Google).
    if (Date.now() - decoded.ts > 15 * 60_000) return null;
    if (!decoded.organizationId || !decoded.userId) return null;
    return { organizationId: decoded.organizationId, userId: decoded.userId };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: GoogleOAuthState): string {
  const clientId = getGoogleCalendarClientId();
  if (!clientId) {
    throw new Error("Falta NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID en .env.local");
  }

  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCalendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // necesario para refresh_token
  url.searchParams.set("prompt", "consent"); // fuerza refresh_token también en reconexiones
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", signGoogleOAuthState(state));
  return url.toString();
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number;
  scope: string;
}

export async function exchangeGoogleAuthCode(code: string): Promise<GoogleTokenResult> {
  const clientId = getGoogleCalendarClientId();
  const clientSecret = getGoogleCalendarClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Falta configuración OAuth de Google Calendar (client id/secret)");
  }

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleCalendarRedirectUri()
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google OAuth error ${res.status}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSec: json.expires_in ?? 3600,
    scope: json.scope ?? ""
  };
}

export interface GoogleRefreshResult {
  accessToken: string;
  expiresInSec: number;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleRefreshResult> {
  const clientId = getGoogleCalendarClientId();
  const clientSecret = getGoogleCalendarClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Falta configuración OAuth de Google Calendar (client id/secret)");
  }

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google refresh error ${res.status}`);
  }

  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? 3600 };
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { email?: string };
  return json.email?.trim() || null;
}
