import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsAppE164, toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export async function getWhatsAppChannelByE164(
  db: SupabaseClient,
  businessE164: string
): Promise<WhatsAppChannelRecord | null> {
  const e164 = normalizeWhatsAppE164(businessE164);
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();

  if (error || data) {
    if (error) return null;
    return toWhatsAppChannelRecord(data);
  }

  // Fallback: filas guardadas con espacios u otro formato legacy
  const { data: rows, error: listErr } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("status", "active");

  if (listErr || !rows?.length) return null;
  const match = rows.find(row => normalizeWhatsAppE164(String(row.e164)) === e164);
  return match ? toWhatsAppChannelRecord(match) : null;
}

export async function getWhatsAppChannelByMetaPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string
): Promise<WhatsAppChannelRecord | null> {
  const id = phoneNumberId.trim();
  if (!id) return null;

  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("meta_phone_number_id", id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return toWhatsAppChannelRecord(data);
}

export async function getWhatsAppChannelById(
  db: SupabaseClient,
  organizationId: string,
  channelId: string
): Promise<WhatsAppChannelRecord | null> {
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return toWhatsAppChannelRecord(data);
}

export async function claimInboundMessageSid(
  db: SupabaseClient,
  messageSid: string
): Promise<boolean> {
  const { error } = await db.from("whatsapp_inbound_dedup").insert({ message_sid: messageSid });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}
