import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExternalQuoteSourceRecord {
  id: string;
  organizationId: string;
  label: string;
  inboundToken: string;
  status: "active" | "disconnected";
  createdAt: string;
}

interface ExternalQuoteSourceRow {
  id: string;
  organization_id: string;
  label: string;
  inbound_token: string;
  status: string;
  created_at: string;
}

function toRecord(row: ExternalQuoteSourceRow): ExternalQuoteSourceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    inboundToken: row.inbound_token,
    status: row.status as ExternalQuoteSourceRecord["status"],
    createdAt: row.created_at
  };
}

export async function listExternalQuoteSources(
  db: SupabaseClient,
  organizationId: string
): Promise<ExternalQuoteSourceRecord[]> {
  const { data } = await db
    .from("external_quote_sources")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return ((data as ExternalQuoteSourceRow[] | null) ?? []).map(toRecord);
}

export async function createExternalQuoteSource(
  db: SupabaseClient,
  params: { organizationId: string; label: string; createdByUserId: string }
): Promise<ExternalQuoteSourceRecord> {
  const { data, error } = await db
    .from("external_quote_sources")
    .insert({
      organization_id: params.organizationId,
      label: params.label,
      created_by_user_id: params.createdByUserId
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la fuente externa");
  return toRecord(data as ExternalQuoteSourceRow);
}

/** Solo para el endpoint público de webhook — busca por token, sin filtrar por organización (el token ES la autenticación). */
export async function getExternalQuoteSourceByToken(
  db: SupabaseClient,
  token: string
): Promise<ExternalQuoteSourceRecord | null> {
  const { data } = await db
    .from("external_quote_sources")
    .select("*")
    .eq("inbound_token", token)
    .eq("status", "active")
    .maybeSingle();
  return data ? toRecord(data as ExternalQuoteSourceRow) : null;
}
