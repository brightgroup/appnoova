import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/** Ampliar junto con el CHECK de 113_insurer_connections.sql al sumar una aseguradora. */
export type InsurerProviderKey = "la_equidad" | "verifik";

export type InsurerConnectionStatus = "pending" | "active" | "disconnected" | "error";

/** Vista pública (sin credenciales) — lo único que debe llegar al frontend. */
export interface InsurerConnectionRecord {
  id: string;
  organizationId: string;
  providerKey: InsurerProviderKey;
  displayName: string;
  status: InsurerConnectionStatus;
  lastError: string | null;
  lastTestedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

interface InsurerConnectionRow {
  id: string;
  organization_id: string;
  provider_key: string;
  display_name: string;
  credentials_enc: string;
  status: string;
  last_error: string | null;
  last_tested_at: string | null;
  updated_at: string;
  created_at: string;
}

function toPublicRecord(row: InsurerConnectionRow): InsurerConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    providerKey: row.provider_key as InsurerProviderKey,
    displayName: row.display_name,
    status: row.status as InsurerConnectionStatus,
    lastError: row.last_error,
    lastTestedAt: row.last_tested_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

export async function getInsurerConnectionRecord(
  db: SupabaseClient,
  organizationId: string,
  providerKey: InsurerProviderKey
): Promise<InsurerConnectionRecord | null> {
  const { data } = await db
    .from("insurer_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider_key", providerKey)
    .maybeSingle();

  return data ? toPublicRecord(data as InsurerConnectionRow) : null;
}

export async function disconnectInsurerConnection(
  db: SupabaseClient,
  organizationId: string,
  providerKey: InsurerProviderKey
): Promise<void> {
  await db
    .from("insurer_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("provider_key", providerKey);
}

export async function listInsurerConnectionsForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<InsurerConnectionRecord[]> {
  const { data } = await db
    .from("insurer_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return ((data as InsurerConnectionRow[] | null) ?? []).map(toPublicRecord);
}

/** Credenciales en claro, para uso exclusivo del adaptador que llama el web service. Nunca exponer al frontend. */
export async function getInsurerCredentials<T = Record<string, string>>(
  db: SupabaseClient,
  organizationId: string,
  providerKey: InsurerProviderKey
): Promise<{ connectionId: string; credentials: T } | null> {
  const { data } = await db
    .from("insurer_connections")
    .select("id, credentials_enc")
    .eq("organization_id", organizationId)
    .eq("provider_key", providerKey)
    .neq("status", "disconnected")
    .maybeSingle();

  if (!data) return null;
  return {
    connectionId: data.id as string,
    credentials: JSON.parse(decryptToken(data.credentials_enc as string)) as T
  };
}

export async function upsertInsurerConnection(
  db: SupabaseClient,
  params: {
    organizationId: string;
    providerKey: InsurerProviderKey;
    displayName: string;
    credentials: Record<string, string>;
    connectedByUserId: string;
  }
): Promise<InsurerConnectionRecord> {
  const { data, error } = await db
    .from("insurer_connections")
    .upsert(
      {
        organization_id: params.organizationId,
        provider_key: params.providerKey,
        display_name: params.displayName,
        credentials_enc: encryptToken(JSON.stringify(params.credentials)),
        status: "pending",
        last_error: null,
        connected_by_user_id: params.connectedByUserId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,provider_key" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo guardar la conexión de la aseguradora");
  }
  return toPublicRecord(data as InsurerConnectionRow);
}

export async function markInsurerConnectionResult(
  db: SupabaseClient,
  connectionId: string,
  result: { ok: true } | { ok: false; message: string }
): Promise<void> {
  const lastError = "message" in result ? result.message : null;
  const status = result.ok ? "active" : "error";

  await db
    .from("insurer_connections")
    .update({ status, last_error: lastError, last_tested_at: new Date().toISOString() })
    .eq("id", connectionId);
}
