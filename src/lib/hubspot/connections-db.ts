import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/** Vista pública (sin tokens) — lo único que debe llegar al frontend. */
export interface HubspotConnectionRecord {
  id: string;
  organizationId: string;
  authMode: "private_app" | "oauth";
  portalId: string | null;
  hubDomain: string | null;
  status: "active" | "disconnected" | "error";
  lastError: string | null;
  updatedAt: string;
}

/** Con el token en claro — solo para uso interno del servidor (llamadas a la API de HubSpot). */
export interface HubspotConnectionSecrets extends HubspotConnectionRecord {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
}

interface HubspotConnectionRow {
  id: string;
  organization_id: string;
  auth_mode: string;
  portal_id: string | null;
  hub_domain: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: string;
  last_error: string | null;
  updated_at: string;
}

function toPublicRecord(row: HubspotConnectionRow): HubspotConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    authMode: (row.auth_mode as HubspotConnectionRecord["authMode"]) || "private_app",
    portalId: row.portal_id,
    hubDomain: row.hub_domain,
    status: row.status as HubspotConnectionRecord["status"],
    lastError: row.last_error,
    updatedAt: row.updated_at
  };
}

function toSecrets(row: HubspotConnectionRow): HubspotConnectionSecrets {
  return {
    ...toPublicRecord(row),
    accessToken: decryptToken(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null,
    tokenExpiresAt: row.token_expires_at
  };
}

/**
 * Trae la conexión de la org salvo que la hayan desconectado a propósito —
 * igual criterio que `getActiveCalendarConnection`: no filtra por
 * status = "active" para que una conexión en "error" (token revocado,
 * fallo transitorio) siga siendo la que se muestra/reintenta, en vez de
 * desaparecer para siempre.
 */
export async function getHubspotConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<HubspotConnectionRecord | null> {
  const { data } = await db
    .from("hubspot_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .maybeSingle();

  return data ? toPublicRecord(data as HubspotConnectionRow) : null;
}

export async function getHubspotConnectionSecretsById(
  db: SupabaseClient,
  connectionId: string
): Promise<HubspotConnectionSecrets | null> {
  const { data } = await db.from("hubspot_connections").select("*").eq("id", connectionId).maybeSingle();
  if (!data) return null;
  const row = data as HubspotConnectionRow;
  try {
    return toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
}

export async function getActiveHubspotConnectionSecrets(
  db: SupabaseClient,
  organizationId: string
): Promise<HubspotConnectionSecrets | null> {
  const { data } = await db
    .from("hubspot_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return null;
  const row = data as HubspotConnectionRow;
  try {
    return toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
}

/** Si el token guardado no se puede descifrar (típico si CALENDAR_TOKEN_ENC_KEY cambió de entorno), se trata como cualquier otra falla de la conexión en vez de fallar en silencio. */
async function handleDecryptFailure(db: SupabaseClient, row: HubspotConnectionRow, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : "error desconocido";
  const message = `No se pudo leer el token guardado (${detail}). Probablemente la clave de cifrado cambió o no coincide en este entorno. Reconecta HubSpot.`;
  console.error("[hubspot] fallo obteniendo credenciales:", detail);
  await markHubspotConnectionError(db, toPublicRecord(row), message);
}

export interface UpsertHubspotPrivateAppConnectionInput {
  organizationId: string;
  connectedByUserId: string;
  accessToken: string;
  portalId: string | null;
  hubDomain: string | null;
}

/** Crea o reconecta la conexión HubSpot de la organización (única por org — constraint hubspot_connections_org_unique). */
export async function upsertHubspotPrivateAppConnection(
  db: SupabaseClient,
  input: UpsertHubspotPrivateAppConnectionInput
): Promise<HubspotConnectionRecord> {
  const { data: existing } = await db
    .from("hubspot_connections")
    .select("id")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const row = {
    organization_id: input.organizationId,
    auth_mode: "private_app",
    portal_id: input.portalId,
    hub_domain: input.hubDomain,
    access_token_enc: encryptToken(input.accessToken),
    refresh_token_enc: null,
    token_expires_at: null,
    status: "active",
    last_error: null,
    connected_by_user_id: input.connectedByUserId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = existing?.id
    ? await db.from("hubspot_connections").update(row).eq("id", existing.id).select("*").single()
    : await db.from("hubspot_connections").insert(row).select("*").single();

  if (error || !data) {
    throw new Error(error?.message || "Error guardando la conexión de HubSpot");
  }

  return toPublicRecord(data as HubspotConnectionRow);
}

/**
 * Marca la conexión con error. A diferencia de Google Calendar, hoy no hay
 * un canal de notificación por correo para HubSpot — el estado queda
 * disponible en `status`/`lastError` para que la UI del conector lo muestre;
 * agregar el aviso por correo es una extensión directa (mismo patrón que
 * `notifyCalendarConnectionBroken`) cuando haga falta.
 */
export async function markHubspotConnectionError(
  db: SupabaseClient,
  connection: Pick<HubspotConnectionRecord, "id">,
  message: string
): Promise<void> {
  await db
    .from("hubspot_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connection.id);
}

export async function disconnectHubspotConnection(db: SupabaseClient, organizationId: string): Promise<void> {
  await db
    .from("hubspot_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}
