import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { notifyCalendarConnectionBroken } from "@/lib/email/notify-calendar-disconnected";
import { mintDelegatedAccessToken } from "@/lib/google-calendar/service-account";

const HOSTED_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

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
  /** 'oauth': el cliente conectó su propia cuenta. 'hosted': calendario creado y compartido por Noova (delegación de dominio). */
  connectionMode: "oauth" | "hosted";
  /** Solo en modo hosted: correo del cliente al que se compartió el calendario. */
  sharedWithEmail: string | null;
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
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  calendar_id: string;
  status: string;
  last_error: string | null;
  updated_at: string;
  connection_mode: string;
  shared_with_email: string | null;
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
    updatedAt: row.updated_at,
    connectionMode: (row.connection_mode as CalendarConnectionRecord["connectionMode"]) || "oauth",
    sharedWithEmail: row.shared_with_email
  };
}

/** En modo hosted no hay tokens guardados: se emite un access token delegado fresco en cada uso. */
async function toSecrets(row: CalendarConnectionRow): Promise<CalendarConnectionSecrets> {
  const publicRecord = toPublicRecord(row);

  if (publicRecord.connectionMode === "hosted") {
    if (!row.google_email) throw new Error("Conexión hosted sin cuenta de Workspace asociada");
    const { accessToken, expiresInSec } = await mintDelegatedAccessToken(row.google_email, HOSTED_CALENDAR_SCOPE);
    return {
      ...publicRecord,
      accessToken,
      refreshToken: "",
      tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString()
    };
  }

  if (!row.access_token_enc || !row.refresh_token_enc) {
    throw new Error("Conexión OAuth sin tokens guardados");
  }
  return {
    ...publicRecord,
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
    return await toSecrets(row);
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
    return await toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
}

/**
 * Si no se pueden obtener credenciales utilizables (OAuth: el token guardado
 * no se puede descifrar, típico si `CALENDAR_TOKEN_ENC_KEY` cambió; hosted:
 * la cuenta de servicio con delegación de dominio falló), esto pasaba antes
 * en silencio — ni tocaba Google ni la fila en BD, así que nunca se
 * notificaba ni quedaba registro. Ahora se trata igual que cualquier otra
 * falla de la conexión.
 */
async function handleDecryptFailure(
  db: SupabaseClient,
  row: CalendarConnectionRow,
  err: unknown
): Promise<void> {
  const detail = err instanceof Error ? err.message : "error desconocido";
  const message =
    row.connection_mode === "hosted"
      ? `No se pudo autenticar el calendario alojado por Noova (${detail}). Revisa la cuenta de servicio y la delegación de dominio.`
      : `No se pudo leer el token guardado (${detail}). Probablemente CALENDAR_TOKEN_ENC_KEY cambió o no coincide en este entorno. Reconecta el calendario.`;
  console.error("[calendar] fallo obteniendo credenciales:", detail);
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

export interface HostedCalendarConnectionInput {
  organizationId: string;
  /** Cuenta de Workspace bajo la cual se crea el calendario (dueña real ante Google). */
  impersonateEmail: string;
  /** Correo del cliente al que se comparte el calendario creado. */
  sharedWithEmail: string;
  calendarId: string;
}

/** Persiste una conexión en modo "hosted" ya creada en Google (ver `createHostedCalendar`). */
export async function upsertHostedCalendarConnection(
  db: SupabaseClient,
  input: HostedCalendarConnectionInput
): Promise<CalendarConnectionRecord> {
  const { data: existing } = await db
    .from("calendar_connections")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("provider", "google")
    .maybeSingle();

  const row = {
    organization_id: input.organizationId,
    provider: "google",
    connection_mode: "hosted",
    google_email: input.impersonateEmail,
    shared_with_email: input.sharedWithEmail,
    calendar_id: input.calendarId,
    access_token_enc: null,
    refresh_token_enc: null,
    token_expires_at: null,
    scope: HOSTED_CALENDAR_SCOPE,
    status: "active",
    last_error: null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = existing?.id
    ? await db.from("calendar_connections").update(row).eq("id", existing.id).select("*").single()
    : await db.from("calendar_connections").insert(row).select("*").single();

  if (error || !data) {
    throw new Error(error?.message || "Error guardando la conexión hosted de calendario");
  }

  return toPublicRecord(data as CalendarConnectionRow);
}
