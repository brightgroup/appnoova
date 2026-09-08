import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

export interface SoftsegurosCredentials {
  username: string;
  password: string;
}

export type SoftsegurosConnectionStatus = "pending" | "active" | "disconnected" | "error";

export interface SoftsegurosConnectionRecord {
  id: string;
  organizationId: string;
  status: SoftsegurosConnectionStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

interface SoftsegurosConnectionRow {
  id: string;
  organization_id: string;
  credentials_enc: string;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
}

function toPublicRecord(row: SoftsegurosConnectionRow): SoftsegurosConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status as SoftsegurosConnectionStatus,
    lastError: row.last_error,
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at
  };
}

export async function getSoftsegurosConnection(
  db: SupabaseClient,
  organizationId: string
): Promise<SoftsegurosConnectionRecord | null> {
  const { data } = await db
    .from("softseguros_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? toPublicRecord(data as SoftsegurosConnectionRow) : null;
}

export async function getSoftsegurosCredentials(
  db: SupabaseClient,
  organizationId: string
): Promise<SoftsegurosCredentials | null> {
  const { data } = await db
    .from("softseguros_connections")
    .select("credentials_enc")
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!data) return null;
  return JSON.parse(decryptToken(data.credentials_enc as string)) as SoftsegurosCredentials;
}

export async function upsertSoftsegurosConnection(
  db: SupabaseClient,
  params: { organizationId: string; credentials: SoftsegurosCredentials; connectedByUserId: string }
): Promise<SoftsegurosConnectionRecord> {
  const { data, error } = await db
    .from("softseguros_connections")
    .upsert(
      {
        organization_id: params.organizationId,
        credentials_enc: encryptToken(JSON.stringify(params.credentials)),
        status: "pending",
        last_error: null,
        connected_by_user_id: params.connectedByUserId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar la conexión de Softseguros");
  return toPublicRecord(data as SoftsegurosConnectionRow);
}

export async function markSoftsegurosConnectionResult(
  db: SupabaseClient,
  organizationId: string,
  result: { ok: true } | { ok: false; message: string }
): Promise<void> {
  const lastError = "message" in result ? result.message : null;
  const status = result.ok ? "active" : "error";
  await db
    .from("softseguros_connections")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}

export async function markSoftsegurosSynced(db: SupabaseClient, organizationId: string): Promise<void> {
  await db
    .from("softseguros_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}
