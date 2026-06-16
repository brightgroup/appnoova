import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

/** Canal de conversaciones iniciadas por WhatsApp (Twilio Fase 0). */
export const WHATSAPP_CONVERSATION_CHANNEL = "whatsapp";

export function toWhatsAppChannelRecord(raw: Record<string, unknown>): WhatsAppChannelRecord {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    text_agent_id: raw.text_agent_id ? String(raw.text_agent_id) : null,
    provider: String(raw.provider ?? "twilio"),
    e164: String(raw.e164),
    twilio_messaging_service_sid: raw.twilio_messaging_service_sid
      ? String(raw.twilio_messaging_service_sid)
      : null,
    friendly_name: raw.friendly_name ? String(raw.friendly_name) : null,
    waba_id: raw.waba_id ? String(raw.waba_id) : null,
    organization_id: raw.organization_id ? String(raw.organization_id) : null,
    twilio_subaccount_sid: raw.twilio_subaccount_sid ? String(raw.twilio_subaccount_sid) : null,
    twilio_subaccount_auth_token: raw.twilio_subaccount_auth_token ? String(raw.twilio_subaccount_auth_token) : null,
    status:
      raw.status === "active" || raw.status === "suspended"
        ? raw.status
        : "pending",
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {},
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at)
  };
}

/** +57 321 9883163 → +573219883163 */
export function normalizeWhatsAppE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed.slice("whatsapp:".length).trim()
    : trimmed;
  const compact = withoutPrefix.replace(/[\s().-]/g, "");
  if (!compact) return "";
  return compact.startsWith("+") ? compact : `+${compact}`;
}

/** whatsapp:+573001234567 → +573001234567 */
export function parseTwilioWhatsAppAddress(value: string): string {
  return normalizeWhatsAppE164(value);
}

export function toTwilioWhatsAppAddress(e164: string): string {
  const normalized = e164.startsWith("+") ? e164 : `+${e164}`;
  return `whatsapp:${normalized}`;
}
