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

export interface TwilioSender {
  sid: string;
  sender_id: string;
  status?: TwilioSenderStatus;
  webhook?: TwilioSenderWebhook | null;
  configuration?: { waba_id?: string | null } | null;
}

function formatTwilioError(
  context: string,
  status: number,
  json: { message?: string; code?: number | string; more_info?: string; details?: unknown }
): string {
  const bits = [
    json.message,
    json.code != null ? `code ${json.code}` : null,
    typeof json.details === "string" ? json.details : null,
    json.more_info ? String(json.more_info) : null
  ].filter(Boolean);
  console.error(`[twilio/senders] ${context}:`, status, JSON.stringify(json).slice(0, 1200));
  return bits.join(" — ") || `${context} HTTP ${status}`;
}

/** Lista WhatsApp Senders de la cuenta/subcuenta. */
export async function listTwilioWhatsAppSenders(input: {
  accountSid: string;
  authToken: string;
}): Promise<TwilioSender[]> {
  const auth = authHeader(input.accountSid, input.authToken);
  const listRes = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50`,
    { headers: { Authorization: auth } }
  );
  const listJson = (await listRes.json().catch(() => ({}))) as {
    senders?: TwilioSender[];
    message?: string;
    code?: number | string;
  };

  if (!listRes.ok) {
    throw new Error(formatTwilioError("list", listRes.status, listJson));
  }

  return listJson.senders ?? [];
}

export function findTwilioSenderByE164(senders: TwilioSender[], e164: string): TwilioSender | null {
  const senderId = whatsAppSenderId(e164);
  return senders.find(row => row.sender_id === senderId) ?? null;
}

/** WABA ya vinculado a esta subcuenta (si hay senders). */
export function linkedWabaIdFromSenders(senders: TwilioSender[]): string | null {
  for (const sender of senders) {
    const id = sender.configuration?.waba_id?.trim();
    if (id) return id;
  }
  return null;
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

  const senders = await listTwilioWhatsAppSenders(input);
  const sender = senders.find(row => row.sender_id === senderId);
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

  const updateJson = (await updateRes.json().catch(() => ({}))) as {
    message?: string;
    code?: number | string;
  };
  if (!updateRes.ok && updateRes.status !== 202) {
    throw new Error(formatTwilioError("webhook update", updateRes.status, updateJson));
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

  const senders = await listTwilioWhatsAppSenders(input);
  const sender = senders.find(row => row.sender_id === senderId);
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

  const updateJson = (await updateRes.json().catch(() => ({}))) as {
    message?: string;
    code?: number | string;
  };
  if (!updateRes.ok && updateRes.status !== 202) {
    throw new Error(formatTwilioError("webhook detach", updateRes.status, updateJson));
  }

  return { senderSid: sender.sid };
}

/**
 * Registra un WhatsApp Sender (Tech Provider / Embedded Signup).
 * Error 63100 exige profile.name aunque el número sea BYO (doc Tech Provider
 * dice que Meta lo ignora/usa el suyo, pero la API igual lo valida como requerido).
 */
export async function registerTwilioWhatsAppSender(input: {
  e164: string;
  wabaId: string;
  accountSid: string;
  authToken: string;
  /** Nombre de perfil WhatsApp (verified_name de Meta). Obligatorio para evitar 63100. */
  profileName: string;
}): Promise<{ senderSid: string; status: TwilioSenderStatus }> {
  const senderId = whatsAppSenderId(input.e164);
  const auth = authHeader(input.accountSid, input.authToken);
  const webhookUrl = twilioWhatsAppWebhookUrl();
  const statusUrl = twilioWhatsAppStatusWebhookUrl();
  const profileName = input.profileName.trim();

  if (!profileName) {
    throw new Error("profile.name requerido para registrar el WhatsApp Sender en Twilio");
  }

  if (!webhookUrl.startsWith("https://")) {
    throw new Error(
      `Webhook WhatsApp inválido (${webhookUrl}). Configura NOOVA_APP_URL o NOOVA_WEBHOOK_BASE_URL con HTTPS público.`
    );
  }

  // Payload alineado al ejemplo Tech Provider: profile.name + waba_id + webhook inbound.
  // status_callback se aplica después (update) para evitar rechazos 63100 por campos extra.
  const body: Record<string, unknown> = {
    sender_id: senderId,
    configuration: { waba_id: input.wabaId },
    profile: { name: profileName },
    webhook: {
      callback_method: "POST",
      callback_url: webhookUrl
    }
  };

  const res = await fetch("https://messaging.twilio.com/v2/Channels/Senders", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => ({}))) as TwilioSender & {
    message?: string;
    code?: number | string;
    more_info?: string;
    details?: unknown;
  };
  if (!res.ok) {
    const detail = formatTwilioError("create", res.status, json);
    throw new Error(
      `${detail} | sender=${senderId} waba=${input.wabaId} profile="${profileName}" webhook=${webhookUrl}`
    );
  }

  if (!json.sid) {
    throw new Error("Twilio no devolvió SID del sender");
  }

  // Best-effort: status callback (no bloquea el alta).
  try {
    await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${json.sid}`, {
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
    });
  } catch (err) {
    console.warn("[twilio/senders] status webhook update skipped:", err);
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
  const json = (await res.json().catch(() => ({}))) as TwilioSender & {
    message?: string;
    code?: number | string;
  };
  if (!res.ok) {
    throw new Error(formatTwilioError("fetch", res.status, json));
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
