import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export async function getWhatsAppChannelByE164(
  db: SupabaseClient,
  businessE164: string
): Promise<WhatsAppChannelRecord | null> {
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("e164", businessE164)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return toWhatsAppChannelRecord(data);
}

export async function getWhatsAppChannelById(
  db: SupabaseClient,
  userId: string,
  channelId: string
): Promise<WhatsAppChannelRecord | null> {
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("user_id", userId)
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
