import crypto from "crypto";
import { twilioWhatsAppStatusWebhookUrl, twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";
import { toTwilioWhatsAppAddress } from "@/lib/whatsapp-channel";

function twilioCredentials(): { accountSid: string; authToken: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export function isTwilioWhatsAppConfigured(): boolean {
  return twilioCredentials() !== null;
}

export { twilioWhatsAppWebhookUrl };

/** Valida X-Twilio-Signature (recomendado en producción). */
export function validateTwilioWebhookSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
  authToken?: string | null
): boolean {
  const token = authToken?.trim() || twilioCredentials()?.authToken;
  if (!token || !signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let payload = url;
  for (const key of sortedKeys) {
    payload += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", token)
    .update(Buffer.from(payload, "utf-8"))
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface SendWhatsAppMessageInput {
  toE164: string;
  fromE164?: string;
  messagingServiceSid?: string | null;
  body: string;
  /** Opcional: credenciales de subcuenta */
  accountSid?: string | null;
  authToken?: string | null;
}

export interface SendWhatsAppTemplateInput {
  toE164: string;
  fromE164?: string;
  messagingServiceSid?: string | null;
  contentSid: string;
  contentVariables?: Record<string, string>;
  /** Opcional: credenciales de subcuenta */
  accountSid?: string | null;
  authToken?: string | null;
}

async function postTwilioMessage(form: Record<string, string>, accountSid?: string | null, authToken?: string | null): Promise<{ sid: string }> {
  const master = twilioCredentials();
  if (!master) {
    throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  // Usar credenciales de subcuenta si se proporcionan, si no las master
  const activeSid = accountSid || master.accountSid;
  const activeToken = authToken || master.authToken;

  form.StatusCallback = twilioWhatsAppStatusWebhookUrl();

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${activeSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(activeSid, activeToken),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(form).toString()
    }
  );

  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Twilio WhatsApp error ${res.status}`);
  }

  return { sid: String(json.sid ?? "") };
}

function whatsAppAddress(address: string): string {
  // Soporta E.164 (+57…) y BSUID (CO.1808…) — ver toTwilioWhatsAppAddress.
  return toTwilioWhatsAppAddress(address);
}

function applyFromFields(
  form: Record<string, string>,
  input: { fromE164?: string; messagingServiceSid?: string | null }
): void {
  if (input.messagingServiceSid?.trim()) {
    form.MessagingServiceSid = input.messagingServiceSid.trim();
  } else if (input.fromE164?.trim()) {
    form.From = whatsAppAddress(input.fromE164);
  } else {
    throw new Error("Falta número From o MessagingServiceSid para WhatsApp");
  }
}

export async function sendTwilioWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<{ sid: string }> {
  const form: Record<string, string> = {
    To: whatsAppAddress(input.toE164),
    Body: input.body
  };
  applyFromFields(form, input);
  return postTwilioMessage(form, input.accountSid, input.authToken);
}

/** Plantilla aprobada por Meta (ContentSid HX…). Fuera de ventana 24 h. */
export async function sendTwilioWhatsAppTemplate(
  input: SendWhatsAppTemplateInput
): Promise<{ sid: string }> {
  const form: Record<string, string> = {
    To: whatsAppAddress(input.toE164),
    ContentSid: input.contentSid.trim()
  };
  applyFromFields(form, input);
  if (input.contentVariables && Object.keys(input.contentVariables).length > 0) {
    form.ContentVariables = JSON.stringify(input.contentVariables);
  }
  return postTwilioMessage(form, input.accountSid, input.authToken);
}

export interface SendTwilioTypingIndicatorInput {
  /** SID (SM…/MM…) del mensaje entrante al que se responde. */
  messageSid: string;
  accountSid?: string | null;
  authToken?: string | null;
}

/**
 * Indicador nativo de "escribiendo…" de WhatsApp — Twilio lo desaparece solo
 * al entregar la respuesta o a los 25s, lo que pase primero. Endpoint propio
 * (no el de envío de mensajes), no lleva Accounts/{sid} en la URL.
 */
export async function sendTwilioTypingIndicator(input: SendTwilioTypingIndicatorInput): Promise<void> {
  const master = twilioCredentials();
  const activeSid = input.accountSid || master?.accountSid;
  const activeToken = input.authToken || master?.authToken;
  if (!activeSid || !activeToken) {
    throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  const res = await fetch("https://messaging.twilio.com/v3/Indicators/Typing.json", {
    method: "POST",
    headers: {
      Authorization: authHeader(activeSid, activeToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel: "WHATSAPP", messageId: input.messageSid })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio typing indicator error ${res.status}: ${detail.slice(0, 200)}`);
  }
}
