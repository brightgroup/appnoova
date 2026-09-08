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

export interface SendMetaWhatsAppMediaInput {
  phoneNumberId: string;
  accessToken: string;
  toE164: string;
  mediaUrl: string;
  mediaType: "image" | "document";
  caption?: string;
  /** Solo aplica a document — el nombre de archivo que ve el cliente. */
  filename?: string;
}

/** Envía imagen o documento por URL vía Cloud API. */
export async function sendMetaWhatsAppMediaMessage(
  input: SendMetaWhatsAppMediaInput
): Promise<SendMetaWhatsAppTextResult> {
  const mediaPayload: Record<string, unknown> =
    input.mediaType === "image"
      ? { link: input.mediaUrl, caption: input.caption || undefined }
      : { link: input.mediaUrl, caption: input.caption || undefined, filename: input.filename || undefined };

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
      type: input.mediaType,
      [input.mediaType]: mediaPayload
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `Meta send media error ${res.status}`);
  }

  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("Meta no devolvió message id");
  }

  return { messageId };
}

export interface SendMetaWhatsAppInteractiveInput {
  phoneNumberId: string;
  accessToken: string;
  toE164: string;
  body: string;
  /** Máximo 3 — la API de WhatsApp no permite más. */
  buttons?: { id: string; title: string }[];
  /** Máximo 10 filas en total. Alternativa a `buttons` cuando hay más de 3 opciones. */
  listSections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  listButtonLabel?: string;
}

/**
 * Mensaje interactivo (botones o lista) vía Cloud API — Fase 2.5 del plan de
 * Noova Seguros. Solo sirve para decisiones cortas (confirmar, elegir un
 * plan): la API de WhatsApp no tiene campos de texto libre nativos, así que
 * datos abiertos (nombre, fecha de nacimiento) siguen siendo texto normal.
 * No requiere ningún permiso nuevo de Meta — mismo endpoint que texto/medios,
 * solo cambia el `type` del payload.
 */
export async function sendMetaWhatsAppInteractiveMessage(
  input: SendMetaWhatsAppInteractiveInput
): Promise<SendMetaWhatsAppTextResult> {
  if (!input.buttons?.length && !input.listSections?.length) {
    throw new Error("Falta pasar buttons o listSections");
  }
  if (input.buttons && input.buttons.length > 3) {
    throw new Error("WhatsApp permite máximo 3 botones — usa listSections para más opciones");
  }

  const interactive = input.buttons?.length
    ? {
        type: "button",
        body: { text: input.body },
        action: {
          buttons: input.buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) }
          }))
        }
      }
    : {
        type: "list",
        body: { text: input.body },
        action: {
          button: (input.listButtonLabel ?? "Ver opciones").slice(0, 20),
          sections: input.listSections
        }
      };

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
      type: "interactive",
      interactive
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `Meta send interactive error ${res.status}`);
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
