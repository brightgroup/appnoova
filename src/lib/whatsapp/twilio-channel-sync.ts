import type { SupabaseClient } from "@supabase/supabase-js";
import {
  configureTwilioWhatsAppSenderWebhook,
  fetchTwilioWhatsAppSender,
  type TwilioSenderStatus,
} from "@/lib/whatsapp/twilio-senders";

interface ChannelRow {
  id: string;
  organization_id: string | null;
  e164: string;
  status: string;
  provider: string | null;
  twilio_sender_sid: string | null;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_auth_token: string | null;
  metadata: Record<string, unknown> | null;
}

async function resolveTwilioCredentials(
  db: SupabaseClient,
  row: ChannelRow
): Promise<{ sid: string; authToken: string } | null> {
  let sid = String(row.twilio_subaccount_sid ?? "").trim();
  let authToken = String(row.twilio_subaccount_auth_token ?? "").trim();

  if ((!sid || !authToken) && row.organization_id) {
    const { data: org } = await db
      .from("organizations")
      .select("twilio_subaccount_sid, twilio_subaccount_auth_token")
      .eq("id", row.organization_id)
      .maybeSingle();
    sid = sid || String(org?.twilio_subaccount_sid ?? "").trim();
    authToken = authToken || String(org?.twilio_subaccount_auth_token ?? "").trim();
  }

  if (!sid || !authToken) return null;
  return { sid, authToken };
}

/** Sincroniza estado del sender Twilio y webhooks; activa canal si quedó ONLINE. */
export async function syncTwilioWhatsAppChannel(
  db: SupabaseClient,
  channelId: string
): Promise<{
  senderStatus: TwilioSenderStatus | null;
  activated: boolean;
  webhookConfigured: boolean;
}> {
  const { data: row, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle();

  if (error || !row) {
    throw new Error("Canal no encontrado");
  }

  const channel = row as ChannelRow;
  if (channel.provider !== "twilio" && channel.provider != null) {
    return { senderStatus: null, activated: false, webhookConfigured: false };
  }

  const creds = await resolveTwilioCredentials(db, channel);
  if (!creds) {
    return { senderStatus: null, activated: false, webhookConfigured: false };
  }

  let senderStatus: TwilioSenderStatus | null = null;
  let senderSid = String(channel.twilio_sender_sid ?? "").trim();
  let webhookConfigured = false;

  if (senderSid) {
    const sender = await fetchTwilioWhatsAppSender({
      senderSid,
      accountSid: creds.sid,
      authToken: creds.authToken,
    });
    senderStatus = sender.status ?? null;
  }

  try {
    const webhook = await configureTwilioWhatsAppSenderWebhook({
      e164: channel.e164,
      accountSid: creds.sid,
      authToken: creds.authToken,
    });
    senderSid = webhook.senderSid;
    webhookConfigured = true;
    if (!senderStatus) {
      const sender = await fetchTwilioWhatsAppSender({
        senderSid,
        accountSid: creds.sid,
        authToken: creds.authToken,
      });
      senderStatus = sender.status ?? null;
    }
  } catch {
    /* sender aún no registrado en Twilio */
  }

  const isOnline = senderStatus === "ONLINE";
  const priorMeta =
    channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
      ? channel.metadata
      : {};

  const updates: Record<string, unknown> = {
    twilio_subaccount_sid: creds.sid,
    twilio_subaccount_auth_token: creds.authToken,
    updated_at: new Date().toISOString(),
    metadata: {
      ...priorMeta,
      sender_status: senderStatus,
      last_sync_at: new Date().toISOString(),
    },
  };

  if (senderSid) updates.twilio_sender_sid = senderSid;
  if (isOnline && channel.status === "pending") {
    updates.status = "active";
  }

  await db.from("whatsapp_channels").update(updates).eq("id", channelId);

  return {
    senderStatus,
    activated: isOnline && channel.status === "pending",
    webhookConfigured,
  };
}
