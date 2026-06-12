import crypto from "crypto";
import { twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";

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

export async function sendTwilioWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<{ sid: string }> {
  const creds = twilioCredentials();
  if (!creds) {
    throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  const to = input.toE164.startsWith("whatsapp:")
    ? input.toE164
    : `whatsapp:${input.toE164.startsWith("+") ? input.toE164 : `+${input.toE164}`}`;

  const form: Record<string, string> = {
    To: to,
    Body: input.body
  };

  if (input.messagingServiceSid?.trim()) {
    form.MessagingServiceSid = input.messagingServiceSid.trim();
  } else if (input.fromE164?.trim()) {
    const from = input.fromE164.startsWith("whatsapp:")
      ? input.fromE164
      : `whatsapp:${input.fromE164.startsWith("+") ? input.fromE164 : `+${input.fromE164}`}`;
    form.From = from;
  } else {
    throw new Error("Falta número From o MessagingServiceSid para WhatsApp");
  }

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
