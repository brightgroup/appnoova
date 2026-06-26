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

export type TwilioSenderStatus = "CREATING" | "ONLINE" | "OFFLINE" | "FAILED" | string;

interface TwilioSender {
  sid: string;
  sender_id: string;
  status?: TwilioSenderStatus;
  webhook?: TwilioSenderWebhook | null;
  configuration?: { waba_id?: string | null } | null;
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

/**
 * Quita el webhook inbound del sender en Twilio.
 * El número puede seguir recibiendo en Meta/Twilio (posible cargo entrante),
 * pero Noova deja de procesar y no hay respuestas automáticas.
 */
export async function detachTwilioWhatsAppSenderWebhook(input: {
  e164: string;
  accountSid: string;
  authToken: string;
}): Promise<{ senderSid: string }> {
  const senderId = whatsAppSenderId(input.e164);
  const auth = authHeader(input.accountSid, input.authToken);

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
    throw new Error(`No se encontró WhatsApp Sender ${senderId}`);
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
          callback_url: "",
          status_callback_method: "POST",
          status_callback_url: ""
        }
      })
    }
  );

  const updateJson = (await updateRes.json().catch(() => ({}))) as { message?: string };
  if (!updateRes.ok && updateRes.status !== 202) {
    throw new Error(updateJson.message || `Twilio Senders detach error ${updateRes.status}`);
  }

  return { senderSid: sender.sid };
}

/** Registra un WhatsApp Sender en Twilio (Embedded Signup + Tech Provider). */
export async function registerTwilioWhatsAppSender(input: {
  e164: string;
  wabaId: string;
  accountSid: string;
  authToken: string;
  profileName?: string | null;
}): Promise<{ senderSid: string; status: TwilioSenderStatus }> {
  const senderId = whatsAppSenderId(input.e164);
  const auth = authHeader(input.accountSid, input.authToken);
  const webhookUrl = twilioWhatsAppWebhookUrl();
  const statusUrl = twilioWhatsAppStatusWebhookUrl();

  const body: Record<string, unknown> = {
    sender_id: senderId,
    configuration: { waba_id: input.wabaId },
    webhook: {
      callback_method: "POST",
      callback_url: webhookUrl,
      status_callback_method: "POST",
      status_callback_url: statusUrl
    }
  };

  if (input.profileName?.trim()) {
    body.profile = { name: input.profileName.trim() };
  }

  const res = await fetch("https://messaging.twilio.com/v2/Channels/Senders", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => ({}))) as TwilioSender & { message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Twilio Senders create error ${res.status}`);
  }

  if (!json.sid) {
    throw new Error("Twilio no devolvió SID del sender");
  }

  return { senderSid: json.sid, status: json.status ?? "CREATING" };
}

/** Consulta el estado de un WhatsApp Sender. */
export async function fetchTwilioWhatsAppSender(input: {
  senderSid: string;
  accountSid: string;
  authToken: string;
}): Promise<TwilioSender> {
  const auth = authHeader(input.accountSid, input.authToken);
  const res = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders/${input.senderSid}`,
    { headers: { Authorization: auth } }
  );
  const json = (await res.json().catch(() => ({}))) as TwilioSender & { message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Twilio Senders fetch error ${res.status}`);
  }
  return json;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Espera a que el sender quede ONLINE (o timeout). */
export async function waitForTwilioWhatsAppSenderOnline(input: {
  senderSid: string;
  accountSid: string;
  authToken: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<TwilioSenderStatus> {
  const maxAttempts = input.maxAttempts ?? 12;
  const delayMs = input.delayMs ?? 2500;

  for (let i = 0; i < maxAttempts; i++) {
    const sender = await fetchTwilioWhatsAppSender(input);
    const status = sender.status ?? "CREATING";
    if (status === "ONLINE") return status;
    if (status === "FAILED" || status === "OFFLINE") return status;
    await sleep(delayMs);
  }

  const last = await fetchTwilioWhatsAppSender(input);
  return last.status ?? "CREATING";
}
