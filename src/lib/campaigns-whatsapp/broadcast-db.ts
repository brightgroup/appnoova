import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastCampaignStatus = "borrador" | "enviando" | "completada" | "pausada";
export type BroadcastRecipientEstado = "pendiente" | "enviado" | "fallido" | "omitido_optout";

export interface BroadcastCampaignRecord {
  id: string;
  organizationId: string;
  name: string;
  whatsappChannelId: string;
  templateId: string;
  status: BroadcastCampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastRecipientRecord {
  id: string;
  campaignId: string;
  contactId: string | null;
  contactName: string | null;
  phoneE164: string;
  variableValues: Record<string, string>;
  estado: BroadcastRecipientEstado;
  error: string | null;
  sentAt: string | null;
}

interface CampaignRow {
  id: string;
  organization_id: string;
  name: string;
  whatsapp_channel_id: string;
  template_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RecipientRow {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  contact_name: string | null;
  phone_e164: string;
  variable_values: Record<string, string>;
  estado: string;
  error: string | null;
  sent_at: string | null;
}

function toCampaign(row: CampaignRow): BroadcastCampaignRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    whatsappChannelId: row.whatsapp_channel_id,
    templateId: row.template_id,
    status: row.status as BroadcastCampaignStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRecipient(row: RecipientRow): BroadcastRecipientRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    phoneE164: row.phone_e164,
    variableValues: row.variable_values ?? {},
    estado: row.estado as BroadcastRecipientEstado,
    error: row.error,
    sentAt: row.sent_at
  };
}

export async function listBroadcastCampaigns(
  db: SupabaseClient,
  organizationId: string
): Promise<BroadcastCampaignRecord[]> {
  const { data } = await db
    .from("whatsapp_broadcast_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return ((data as CampaignRow[] | null) ?? []).map(toCampaign);
}

export async function getBroadcastCampaign(
  db: SupabaseClient,
  organizationId: string,
  id: string
): Promise<BroadcastCampaignRecord | null> {
  const { data } = await db
    .from("whatsapp_broadcast_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data ? toCampaign(data as CampaignRow) : null;
}

export async function createBroadcastCampaign(
  db: SupabaseClient,
  params: {
    organizationId: string;
    name: string;
    whatsappChannelId: string;
    templateId: string;
    createdByUserId: string;
    recipients: { contactId: string | null; contactName: string | null; phoneE164: string; variableValues: Record<string, string> }[];
  }
): Promise<BroadcastCampaignRecord> {
  const { data, error } = await db
    .from("whatsapp_broadcast_campaigns")
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      whatsapp_channel_id: params.whatsappChannelId,
      template_id: params.templateId,
      created_by_user_id: params.createdByUserId
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la campaña");
  const campaign = toCampaign(data as CampaignRow);

  if (params.recipients.length > 0) {
    const rows = params.recipients.map(r => ({
      campaign_id: campaign.id,
      contact_id: r.contactId,
      contact_name: r.contactName,
      phone_e164: r.phoneE164,
      variable_values: r.variableValues
    }));
    const { error: recError } = await db.from("whatsapp_broadcast_recipients").insert(rows);
    if (recError) throw new Error(recError.message);
  }

  return campaign;
}

export async function countRecipientsByEstado(
  db: SupabaseClient,
  campaignId: string
): Promise<Record<BroadcastRecipientEstado, number>> {
  const { data } = await db.from("whatsapp_broadcast_recipients").select("estado").eq("campaign_id", campaignId);
  const counts: Record<BroadcastRecipientEstado, number> = {
    pendiente: 0,
    enviado: 0,
    fallido: 0,
    omitido_optout: 0
  };
  for (const row of (data as { estado: string }[] | null) ?? []) {
    counts[row.estado as BroadcastRecipientEstado] = (counts[row.estado as BroadcastRecipientEstado] ?? 0) + 1;
  }
  return counts;
}

export async function updateCampaignStatus(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  status: BroadcastCampaignStatus
): Promise<void> {
  await db
    .from("whatsapp_broadcast_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
}

/** Trae hasta `limit` destinatarios pendientes de campañas 'enviando' — usado por el cron. */
export async function claimPendingRecipients(
  db: SupabaseClient,
  limit: number
): Promise<(BroadcastRecipientRecord & { campaign: BroadcastCampaignRecord })[]> {
  const { data: campaigns } = await db
    .from("whatsapp_broadcast_campaigns")
    .select("*")
    .eq("status", "enviando");

  const result: (BroadcastRecipientRecord & { campaign: BroadcastCampaignRecord })[] = [];
  for (const campaignRow of (campaigns as CampaignRow[] | null) ?? []) {
    if (result.length >= limit) break;
    const campaign = toCampaign(campaignRow);
    const { data: recipients } = await db
      .from("whatsapp_broadcast_recipients")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("estado", "pendiente")
      .limit(limit - result.length);

    for (const r of (recipients as RecipientRow[] | null) ?? []) {
      result.push({ ...toRecipient(r), campaign });
    }
  }
  return result;
}

/** Reclama un destinatario puntual de forma segura ante carreras — si ya lo tomó otro tick, `claimed` viene false. */
export async function claimRecipient(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("whatsapp_broadcast_recipients")
    .update({ estado: "enviado", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function markRecipientFailed(db: SupabaseClient, id: string, error: string): Promise<void> {
  await db.from("whatsapp_broadcast_recipients").update({ estado: "fallido", error }).eq("id", id);
}

export async function markRecipientSkippedOptOut(db: SupabaseClient, id: string): Promise<void> {
  await db.from("whatsapp_broadcast_recipients").update({ estado: "omitido_optout" }).eq("id", id);
}

/** true si ya no quedan pendientes — el cron usa esto para marcar la campaña completada. */
export async function hasNoPendingRecipients(db: SupabaseClient, campaignId: string): Promise<boolean> {
  const { count } = await db
    .from("whatsapp_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("estado", "pendiente");
  return (count ?? 0) === 0;
}
