import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";

export interface MetaInboundMessage {
  messageId: string;
  phoneNumberId: string;
  fromE164: string;
  toE164: string;
  body: string;
  profileName: string | null;
  timestamp: string;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

function e164FromWaId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

/** Extrae mensajes entrantes del webhook Cloud API. */
export function parseMetaWhatsAppInboundMessages(payload: MetaWebhookPayload): MetaInboundMessage[] {
  if (payload.object !== "whatsapp_business_account") return [];

  const results: MetaInboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id?.trim();
      const displayPhone = value?.metadata?.display_phone_number?.trim();
      if (!phoneNumberId) continue;

      const toE164 = displayPhone ? normalizeWhatsAppE164(displayPhone) : "";
      const contactName = value?.contacts?.[0]?.profile?.name?.trim() || null;

      for (const msg of value?.messages ?? []) {
        if (msg.type !== "text" || !msg.id || !msg.from) continue;
        const body = msg.text?.body?.trim() ?? "";
        if (!body) continue;

        results.push({
          messageId: msg.id,
          phoneNumberId,
          fromE164: e164FromWaId(msg.from),
          toE164,
          body,
          profileName: contactName,
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString()
        });
      }
    }
  }

  return results;
}

/** Indica si el payload es solo status update (no mensaje entrante). */
export function isMetaStatusOnlyWebhook(payload: MetaWebhookPayload): boolean {
  if (payload.object !== "whatsapp_business_account") return false;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "messages" && change.value?.messages?.length) return false;
    }
  }
  return true;
}
