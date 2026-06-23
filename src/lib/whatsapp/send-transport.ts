import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp/twilio-whatsapp";
import {
  isMetaWhatsAppChannel,
  readMetaAccessToken,
  sendMetaWhatsAppTextMessage
} from "@/lib/whatsapp/meta-whatsapp";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export interface SendWhatsAppTextInput {
  channel: WhatsAppChannelRecord;
  channelRaw?: Record<string, unknown>;
  toE164: string;
  body: string;
  db?: SupabaseClient;
}

async function resolveMetaToken(
  channel: WhatsAppChannelRecord,
  channelRaw: Record<string, unknown> | undefined,
  db: SupabaseClient | undefined
): Promise<string | null> {
  const fromRaw = channelRaw ? readMetaAccessToken(channelRaw) : null;
  if (fromRaw) return fromRaw;
  if (!db || channel.provider !== "meta") return null;

  const { data } = await db
    .from("whatsapp_channels")
    .select("meta_access_token")
    .eq("id", channel.id)
    .maybeSingle();

  return data?.meta_access_token ? String(data.meta_access_token) : null;
}

/** Envía texto por Twilio o Meta según provider del canal. */
export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput): Promise<{ externalId?: string }> {
  const { channel, toE164, body } = input;
  const metaToken = await resolveMetaToken(channel, input.channelRaw, input.db);

  if (isMetaWhatsAppChannel({ ...channel, meta_access_token: metaToken })) {
    const result = await sendMetaWhatsAppTextMessage({
      phoneNumberId: channel.meta_phone_number_id!,
      accessToken: metaToken!,
      toE164,
      body
    });
    return { externalId: result.messageId };
  }

  const twilio = await sendTwilioWhatsAppMessage({
    toE164,
    fromE164: channel.e164,
    messagingServiceSid: channel.twilio_messaging_service_sid,
    body,
    accountSid: channel.twilio_subaccount_sid,
    authToken: channel.twilio_subaccount_auth_token
  });

  return { externalId: twilio.sid };
}

export function whatsAppProviderForBilling(channel: WhatsAppChannelRecord): "twilio" | "meta" {
  return channel.provider === "meta" ? "meta" : "twilio";
}
