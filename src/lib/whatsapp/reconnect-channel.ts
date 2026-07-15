import type { SupabaseClient } from "@supabase/supabase-js";
import { syncTwilioWhatsAppChannel } from "@/lib/whatsapp/twilio-channel-sync";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

function priorMeta(channel: WhatsAppChannelRecord): Record<string, unknown> {
  return channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
    ? { ...(channel.metadata as Record<string, unknown>) }
    : {};
}

/**
 * Reconecta una línea desconectada por el usuario.
 * Si ya tiene sender Twilio registrado, reactiva sin Embedded Signup.
 */
export async function reconnectWhatsAppChannel(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord
): Promise<{
  channel: WhatsAppChannelRecord;
  mode: "local" | "needs_embedded_signup";
  senderStatus?: string | null;
}> {
  const hasTwilioSender =
    channel.provider === "twilio" && Boolean(String(channel.twilio_sender_sid ?? "").trim());

  if (!hasTwilioSender) {
    return { channel, mode: "needs_embedded_signup" };
  }

  const sync = await syncTwilioWhatsAppChannel(db, channel.id);
  const now = new Date().toISOString();
  const meta = priorMeta(channel);
  delete meta.disconnected_at;
  delete meta.disconnected_by;
  meta.reconnected_at = now;
  meta.reconnected_by = "user";
  if (sync.senderStatus) meta.sender_status = sync.senderStatus;

  const { data, error } = await db
    .from("whatsapp_channels")
    .update({
      status: "active",
      metadata: meta,
      updated_at: now
    })
    .eq("id", channel.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo reactivar la línea");
  }

  return {
    channel: toWhatsAppChannelRecord(data as Record<string, unknown>),
    mode: "local",
    senderStatus: sync.senderStatus
  };
}
