import {
  twilioWhatsAppStatusWebhookUrl,
  twilioWhatsAppWebhookUrl
} from "@/lib/telephony/app-url";

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function whatsAppSenderId(e164: string): string {
  const normalized = e164.startsWith("+") ? e164 : `+${e164}`;
  return `whatsapp:${normalized}`;
}

interface TwilioSenderWebhook {
  callback_method?: string | null;
  callback_url?: string | null;
  status_callback_method?: string | null;
  status_callback_url?: string | null;
}

interface TwilioSender {
  sid: string;
  sender_id: string;
  webhook?: TwilioSenderWebhook | null;
}

/** Configura webhook inbound en el WhatsApp Sender de Twilio (Senders API v2). */
export async function configureTwilioWhatsAppSenderWebhook(input: {
  e164: string;
  accountSid: string;
  authToken: string;
}): Promise<{ senderSid: string; webhookUrl: string }> {
  const senderId = whatsAppSenderId(input.e164);
  const auth = authHeader(input.accountSid, input.authToken);
  const webhookUrl = twilioWhatsAppWebhookUrl();
  const statusUrl = twilioWhatsAppStatusWebhookUrl();

  const listRes = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50`,
    { headers: { Authorization: auth } }
  );
  const listJson = (await listRes.json().catch(() => ({}))) as {
    senders?: TwilioSender[];
    message?: string;
  };

  if (!listRes.ok) {
    throw new Error(listJson.message || `Twilio Senders list error ${listRes.status}`);
  }

  const sender = listJson.senders?.find(row => row.sender_id === senderId);
  if (!sender?.sid) {
    throw new Error(
      `No se encontró WhatsApp Sender ${senderId} en la subcuenta. Completa el onboarding en Twilio primero.`
    );
  }

  const updateRes = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders/${sender.sid}`,
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        webhook: {
          callback_method: "POST",
          callback_url: webhookUrl,
          status_callback_method: "POST",
          status_callback_url: statusUrl
        }
      })
    }
  );

  const updateJson = (await updateRes.json().catch(() => ({}))) as { message?: string };
  if (!updateRes.ok && updateRes.status !== 202) {
    throw new Error(updateJson.message || `Twilio Senders update error ${updateRes.status}`);
  }

  return { senderSid: sender.sid, webhookUrl };
}
