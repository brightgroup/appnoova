import crypto from "crypto";
import { twilioWhatsAppStatusWebhookUrl, twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";

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
  params: Record<string, string>
): boolean {
  const creds = twilioCredentials();
  if (!creds || !signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let payload = url;
  for (const key of sortedKeys) {
    payload += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", creds.authToken)
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
}

export interface SendWhatsAppTemplateInput {
  toE164: string;
  fromE164?: string;
  messagingServiceSid?: string | null;
  contentSid: string;
  contentVariables?: Record<string, string>;
}

async function postTwilioMessage(form: Record<string, string>): Promise<{ sid: string }> {
  const creds = twilioCredentials();
  if (!creds) {
    throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  form.StatusCallback = twilioWhatsAppStatusWebhookUrl();

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(creds.accountSid, creds.authToken),
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

function whatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:")
    ? e164
    : `whatsapp:${e164.startsWith("+") ? e164 : `+${e164}`}`;
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
  return postTwilioMessage(form);
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
  return postTwilioMessage(form);
}
