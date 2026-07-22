import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { notifyCalendarConnectionBroken } from "@/lib/email/notify-calendar-disconnected";

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

/**
 * Trae la conexión de la org salvo que el usuario la haya desconectado a
 * propósito. A propósito NO filtra por status = "active": una conexión en
 * "error" (ej. una falla transitoria de Google, o una env var que se acaba
 * de corregir) debe poder reintentarse en el próximo uso — si no, una vez
 * cae queda muerta para siempre porque nada la reactiva sola (el único
 * camino sería reconectar por OAuth desde cero). El estado real para
 * mostrarle al usuario sigue disponible en `status`/`lastError`.
 */
export async function getActiveCalendarConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<CalendarConnectionRecord | null> {
  const { data } = await db
    .from("calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .neq("status", "disconnected")
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

  if (!data) return null;
  const row = data as CalendarConnectionRow;
  try {
    return toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
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

  if (!data) return null;
  const row = data as CalendarConnectionRow;
  try {
    return toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
}

/**
 * Si el token guardado no se puede descifrar (típico: `CALENDAR_TOKEN_ENC_KEY`
 * cambió o no coincide entre entornos), esto pasaba antes en silencio —
 * ni tocaba Google ni la fila en BD, así que nunca se notificaba ni quedaba
 * registro. Ahora se trata igual que cualquier otra falla de la conexión.
 */
async function handleDecryptFailure(
  db: SupabaseClient,
  row: CalendarConnectionRow,
  err: unknown
): Promise<void> {
  const detail = err instanceof Error ? err.message : "error de descifrado";
  const message = `No se pudo leer el token guardado (${detail}). Probablemente CALENDAR_TOKEN_ENC_KEY cambió o no coincide en este entorno. Reconecta el calendario.`;
  console.error("[calendar] fallo al descifrar el token guardado:", detail);
  await markCalendarConnectionError(db, toPublicRecord(row), message);
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

/**
 * Marca la conexión con error y, solo en la transición activa → error
 * (nunca en fallos repetidos mientras ya está caída), avisa por correo a
 * quienes administran Conectores. Acepta el registro completo (no solo el
 * id) porque necesita `status` previo y `organizationId` para el aviso.
 */
export async function markCalendarConnectionError(
  db: SupabaseClient,
  connection: Pick<CalendarConnectionRecord, "id" | "organizationId" | "status">,
  message: string
): Promise<void> {
  const wasActive = connection.status === "active";

  await db
    .from("calendar_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (wasActive) {
    void notifyCalendarConnectionBroken(connection.organizationId, message).catch(err =>
      console.warn("[calendar] notifyCalendarConnectionBroken:", err)
    );
  }
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
