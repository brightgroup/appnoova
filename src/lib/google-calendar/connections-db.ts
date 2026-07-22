import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/** Vista pública (sin tokens) — lo único que debe llegar al frontend. */
export interface CalendarConnectionRecord {
  id: string;
  organizationId: string;
  provider: "google";
  googleEmail: string | null;
  calendarId: string;
  status: "active" | "disconnected" | "error";
  lastError: string | null;
  updatedAt: string;
}

/** Con tokens en claro — solo para uso interno del servidor (llamadas a Google API). */
export interface CalendarConnectionSecrets extends CalendarConnectionRecord {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
}

interface CalendarConnectionRow {
  id: string;
  organization_id: string;
  provider: string;
  google_email: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string | null;
  calendar_id: string;
  status: string;
  last_error: string | null;
  updated_at: string;
}

function toPublicRecord(row: CalendarConnectionRow): CalendarConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: "google",
    googleEmail: row.google_email,
    calendarId: row.calendar_id,
    status: row.status as CalendarConnectionRecord["status"],
    lastError: row.last_error,
    updatedAt: row.updated_at
  };
}

function toSecrets(row: CalendarConnectionRow): CalendarConnectionSecrets {
  return {
    ...toPublicRecord(row),
    accessToken: decryptToken(row.access_token_enc),
    refreshToken: decryptToken(row.refresh_token_enc),
    tokenExpiresAt: row.token_expires_at
  };
}

export async function getActiveCalendarConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<CalendarConnectionRecord | null> {
  const { data } = await db
    .from("calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .eq("status", "active")
    .maybeSingle();

  return data ? toPublicRecord(data as CalendarConnectionRow) : null;
}

export async function getCalendarConnectionSecretsById(
  db: SupabaseClient,
  connectionId: string
): Promise<CalendarConnectionSecrets | null> {
  const { data } = await db
    .from("calendar_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  return data ? toSecrets(data as CalendarConnectionRow) : null;
}

export async function getActiveCalendarConnectionSecrets(
  db: SupabaseClient,
  organizationId: string
): Promise<CalendarConnectionSecrets | null> {
  const { data } = await db
    .from("calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .eq("status", "active")
    .maybeSingle();

  return data ? toSecrets(data as CalendarConnectionRow) : null;
}

export interface UpsertCalendarConnectionInput {
  organizationId: string;
  connectedByUserId: string;
  googleEmail: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number;
  scope: string;
}

/** Crea o reconecta la conexión Google Calendar de la organización (única por org+provider). */
export async function upsertCalendarConnection(
  db: SupabaseClient,
  input: UpsertCalendarConnectionInput
): Promise<CalendarConnectionRecord> {
  const { data: existing } = await db
    .from("calendar_connections")
    .select("id, refresh_token_enc")
    .eq("organization_id", input.organizationId)
    .eq("provider", "google")
    .maybeSingle();

  const tokenExpiresAt = new Date(Date.now() + input.expiresInSec * 1000).toISOString();
  // Google solo devuelve refresh_token la primera vez (o con prompt=consent); si no llega, conservamos el existente.
  const refreshTokenEnc = input.refreshToken
    ? encryptToken(input.refreshToken)
    : (existing?.refresh_token_enc as string | undefined);

  if (!refreshTokenEnc) {
    throw new Error(
      "Google no devolvió refresh_token. Vuelve a conectar (revoca el acceso previo en tu cuenta de Google si persiste)."
    );
  }

  const row = {
    organization_id: input.organizationId,
    provider: "google",
    google_email: input.googleEmail,
    access_token_enc: encryptToken(input.accessToken),
    refresh_token_enc: refreshTokenEnc,
    token_expires_at: tokenExpiresAt,
    scope: input.scope,
    status: "active",
    last_error: null,
    connected_by_user_id: input.connectedByUserId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = existing?.id
    ? await db
        .from("calendar_connections")
        .update(row)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db
        .from("calendar_connections")
        .insert(row)
        .select("*")
        .single();

  if (error || !data) {
    throw new Error(error?.message || "Error guardando la conexión de Google Calendar");
  }

  return toPublicRecord(data as CalendarConnectionRow);
}

export async function updateCalendarConnectionAccessToken(
  db: SupabaseClient,
  connectionId: string,
  accessToken: string,
  expiresInSec: number
): Promise<void> {
  await db
    .from("calendar_connections")
    .update({
      access_token_enc: encryptToken(accessToken),
      token_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      status: "active",
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", connectionId);
}

export async function markCalendarConnectionError(
  db: SupabaseClient,
  connectionId: string,
  message: string
): Promise<void> {
  await db
    .from("calendar_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

export async function disconnectCalendarConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<void> {
  await db
    .from("calendar_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("provider", "google");
}
