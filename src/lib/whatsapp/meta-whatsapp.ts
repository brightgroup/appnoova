import { metaGraphBaseUrl } from "@/lib/meta/graph-config";
import { isWhatsAppBsuid, normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";

export interface SendMetaWhatsAppTextInput {
  phoneNumberId: string;
  accessToken: string;
  toE164: string;
  body: string;
}

export interface SendMetaWhatsAppTextResult {
  messageId: string;
}

function metaRecipientE164(e164: string): string {
  const normalized = normalizeWhatsAppE164(e164);
  // Cloud API: teléfono sin `+`; BSUID tal cual (CO.xxxx).
  if (isWhatsAppBsuid(normalized)) return normalized;
  return normalized.replace(/^\+/, "");
}

/** Envía mensaje de sesión (texto) vía Cloud API. */
export async function sendMetaWhatsAppTextMessage(
  input: SendMetaWhatsAppTextInput
): Promise<SendMetaWhatsAppTextResult> {
  const res = await fetch(`${metaGraphBaseUrl()}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: metaRecipientE164(input.toE164),
      type: "text",
      text: { preview_url: false, body: input.body }
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `Meta send message error ${res.status}`);
  }

  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("Meta no devolvió message id");
  }

  return { messageId };
}

export function isMetaWhatsAppChannel(channel: {
  provider: string;
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
}): boolean {
  return (
    channel.provider === "meta"
    && Boolean(channel.meta_phone_number_id?.trim())
    && Boolean(channel.meta_access_token?.trim())
  );
}

export interface SendMetaTypingIndicatorInput {
  phoneNumberId: string;
  accessToken: string;
  /** wamid del mensaje entrante al que se responde. */
  messageId: string;
}

/** Indicador nativo de "escribiendo…" vía Cloud API — se envía junto con la confirmación de lectura del mensaje entrante. */
export async function sendMetaWhatsAppTypingIndicator(input: SendMetaTypingIndicatorInput): Promise<void> {
  const res = await fetch(`${metaGraphBaseUrl()}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: input.messageId,
      typing_indicator: { type: "text" }
    })
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message || `Meta typing indicator error ${res.status}`);
  }
}

/** Lee token Meta de fila DB (no expuesto al cliente). */
export function readMetaAccessToken(raw: Record<string, unknown>): string | null {
  const token = raw.meta_access_token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}
