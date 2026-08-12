import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/** Vista pública (sin secreto) — lo único que debe llegar al frontend. */
export interface AutomationConnectionRecord {
  id: string;
  organizationId: string;
  providerKey: "webhook_generic";
  name: string;
  webhookUrl: string;
  status: "active" | "disconnected" | "error";
  lastError: string | null;
  lastTestedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

/** Con el secreto en claro — solo para uso interno del servidor (firmar el envío saliente). */
export interface AutomationConnectionSecrets extends AutomationConnectionRecord {
  secret: string;
}

interface AutomationConnectionRow {
  id: string;
  organization_id: string;
  provider_key: string;
  name: string;
  webhook_url: string;
  secret_enc: string;
  status: string;
  last_error: string | null;
  last_tested_at: string | null;
  updated_at: string;
  created_at: string;
}

function toPublicRecord(row: AutomationConnectionRow): AutomationConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    providerKey: row.provider_key as AutomationConnectionRecord["providerKey"],
    name: row.name,
    webhookUrl: row.webhook_url,
    status: row.status as AutomationConnectionRecord["status"],
    lastError: row.last_error,
    lastTestedAt: row.last_tested_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

function toSecrets(row: AutomationConnectionRow): AutomationConnectionSecrets {
  return {
    ...toPublicRecord(row),
    secret: decryptToken(row.secret_enc)
  };
}

export async function listConnectionsForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<AutomationConnectionRecord[]> {
  const { data } = await db
    .from("automation_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  return ((data as AutomationConnectionRow[] | null) ?? []).map(toPublicRecord);
}

export async function getConnectionById(
  db: SupabaseClient,
  organizationId: string,
  connectionId: string
): Promise<AutomationConnectionRecord | null> {
  const { data } = await db
    .from("automation_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data ? toPublicRecord(data as AutomationConnectionRow) : null;
}

/** Solo para el motor de emisión de eventos — nunca exponer al frontend. */
export async function getConnectionSecretsById(
  db: SupabaseClient,
  connectionId: string
): Promise<AutomationConnectionSecrets | null> {
  const { data } = await db
    .from("automation_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (!data) return null;
  try {
    return toSecrets(data as AutomationConnectionRow);
  } catch (err) {
    console.error("[automations] no se pudo descifrar el secreto de la conexión:", err);
    return null;
  }
}

export interface CreateConnectionInput {
  organizationId: string;
  connectedByUserId: string;
  name: string;
  webhookUrl: string;
  /** Secreto en claro — se cifra antes de guardar. Si no se pasa, se genera uno aleatorio. */
  secret?: string;
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Devuelve también el secreto en claro — solo disponible en este instante de creación. */
export async function createConnection(
  db: SupabaseClient,
  input: CreateConnectionInput
): Promise<{ record: AutomationConnectionRecord; secret: string }> {
  const secret = input.secret?.trim() || randomSecret();

  const { data, error } = await db
    .from("automation_connections")
    .insert({
      organization_id: input.organizationId,
      provider_key: "webhook_generic",
      name: input.name,
      webhook_url: input.webhookUrl,
      secret_enc: encryptToken(secret),
      connected_by_user_id: input.connectedByUserId,
      status: "active"
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Error creando la conexión");
  }

  return { record: toPublicRecord(data as AutomationConnectionRow), secret };
}

export async function markConnectionError(
  db: SupabaseClient,
  connectionId: string,
  message: string
): Promise<void> {
  await db
    .from("automation_connections")
    .update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

export async function markConnectionTested(
  db: SupabaseClient,
  connectionId: string,
  ok: boolean,
  message?: string
): Promise<void> {
  await db
    .from("automation_connections")
    .update({
      status: ok ? "active" : "error",
      last_error: ok ? null : (message?.slice(0, 500) ?? null),
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", connectionId);
}

export async function updateConnectionWebhookUrl(
  db: SupabaseClient,
  organizationId: string,
  connectionId: string,
  webhookUrl: string
): Promise<AutomationConnectionRecord | null> {
  return updateConnectionFields(db, organizationId, connectionId, { webhook_url: webhookUrl });
}

async function updateConnectionFields(
  db: SupabaseClient,
  organizationId: string,
  connectionId: string,
  patch: Record<string, unknown>
): Promise<AutomationConnectionRecord | null> {
  const { data, error } = await db
    .from("automation_connections")
    .update({
      ...patch,
      last_error: null,
      status: "active",
      updated_at: new Date().toISOString()
    })
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toPublicRecord(data as AutomationConnectionRow) : null;
}

export async function disconnectConnection(
  db: SupabaseClient,
  organizationId: string,
  connectionId: string
): Promise<void> {
  await db
    .from("automation_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("organization_id", organizationId);
}

export async function regenerateSecret(
  db: SupabaseClient,
  organizationId: string,
  connectionId: string
): Promise<string> {
  const secret = randomSecret();
  await db
    .from("automation_connections")
    .update({ secret_enc: encryptToken(secret), updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("organization_id", organizationId);
  return secret;
}
