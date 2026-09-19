import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/** Vista pública (sin secretos) — lo único que debe llegar al frontend. */
export interface WooCommerceConnectionRecord {
  id: string;
  organizationId: string;
  siteUrl: string;
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
  orderWebhookId: number | null;
  productWebhookId: number | null;
  updatedAt: string;
}

/** Con las credenciales en claro — solo para uso interno del servidor. */
export interface WooCommerceConnectionSecrets extends WooCommerceConnectionRecord {
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string | null;
}

interface WooCommerceConnectionRow {
  id: string;
  organization_id: string;
  site_url: string;
  credentials_enc: string;
  webhook_secret_enc: string | null;
  order_webhook_id: number | null;
  product_webhook_id: number | null;
  status: string;
  last_error: string | null;
  updated_at: string;
}

interface StoredCredentials {
  consumer_key: string;
  consumer_secret: string;
}

function toPublicRecord(row: WooCommerceConnectionRow): WooCommerceConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    siteUrl: row.site_url,
    status: row.status as WooCommerceConnectionRecord["status"],
    lastError: row.last_error,
    orderWebhookId: row.order_webhook_id,
    productWebhookId: row.product_webhook_id,
    updatedAt: row.updated_at
  };
}

function toSecrets(row: WooCommerceConnectionRow): WooCommerceConnectionSecrets {
  const creds = JSON.parse(decryptToken(row.credentials_enc)) as StoredCredentials;
  return {
    ...toPublicRecord(row),
    consumerKey: creds.consumer_key,
    consumerSecret: creds.consumer_secret,
    webhookSecret: row.webhook_secret_enc ? decryptToken(row.webhook_secret_enc) : null
  };
}

/**
 * Trae la conexión de la org salvo que la hayan desconectado a propósito —
 * mismo criterio que `getHubspotConnection`: una conexión en "error" sigue
 * siendo la que se muestra/reintenta, en vez de desaparecer para siempre.
 */
export async function getWooCommerceConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<WooCommerceConnectionRecord | null> {
  const { data } = await db
    .from("woocommerce_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .maybeSingle();

  return data ? toPublicRecord(data as WooCommerceConnectionRow) : null;
}

export async function getActiveWooCommerceConnectionSecrets(
  db: SupabaseClient,
  organizationId: string
): Promise<WooCommerceConnectionSecrets | null> {
  const { data } = await db
    .from("woocommerce_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return null;
  const row = data as WooCommerceConnectionRow;
  try {
    return toSecrets(row);
  } catch (err) {
    await handleDecryptFailure(db, row, err);
    return null;
  }
}

/** Si las credenciales guardadas no se pueden descifrar (típico si CALENDAR_TOKEN_ENC_KEY cambió de entorno), se trata como cualquier otra falla de la conexión en vez de fallar en silencio. */
async function handleDecryptFailure(db: SupabaseClient, row: WooCommerceConnectionRow, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : "error desconocido";
  const message = `No se pudieron leer las credenciales guardadas (${detail}). Probablemente la clave de cifrado cambió o no coincide en este entorno. Reconecta WooCommerce.`;
  console.error("[woocommerce] fallo obteniendo credenciales:", detail);
  await markWooCommerceConnectionError(db, toPublicRecord(row), message);
}

export interface UpsertWooCommerceConnectionInput {
  organizationId: string;
  connectedByUserId: string;
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string;
}

/** Crea o reconecta la conexión WooCommerce de la organización (única por org — constraint woocommerce_connections_org_unique). */
export async function upsertWooCommerceConnection(
  db: SupabaseClient,
  input: UpsertWooCommerceConnectionInput
): Promise<WooCommerceConnectionRecord> {
  const { data: existing } = await db
    .from("woocommerce_connections")
    .select("id")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const credentials: StoredCredentials = {
    consumer_key: input.consumerKey,
    consumer_secret: input.consumerSecret
  };

  const row = {
    organization_id: input.organizationId,
    site_url: input.siteUrl.replace(/\/+$/, ""),
    credentials_enc: encryptToken(JSON.stringify(credentials)),
    webhook_secret_enc: encryptToken(input.webhookSecret),
    status: "active",
    last_error: null,
    connected_by_user_id: input.connectedByUserId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = existing?.id
    ? await db.from("woocommerce_connections").update(row).eq("id", existing.id).select("*").single()
    : await db.from("woocommerce_connections").insert(row).select("*").single();

  if (error || !data) {
    throw new Error(error?.message || "Error guardando la conexión de WooCommerce");
  }

  return toPublicRecord(data as WooCommerceConnectionRow);
}

export async function saveWebhookIds(
  db: SupabaseClient,
  connectionId: string,
  ids: { orderWebhookId: number | null; productWebhookId: number | null }
): Promise<void> {
  await db
    .from("woocommerce_connections")
    .update({
      order_webhook_id: ids.orderWebhookId,
      product_webhook_id: ids.productWebhookId,
      updated_at: new Date().toISOString()
    })
    .eq("id", connectionId);
}

export async function markWooCommerceConnectionError(
  db: SupabaseClient,
  connection: Pick<WooCommerceConnectionRecord, "id">,
  message: string
): Promise<void> {
  await db
    .from("woocommerce_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connection.id);
}

export async function disconnectWooCommerceConnection(db: SupabaseClient, organizationId: string): Promise<void> {
  await db
    .from("woocommerce_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}
