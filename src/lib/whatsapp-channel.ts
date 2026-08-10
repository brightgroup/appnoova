import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

/** Canal de conversaciones iniciadas por WhatsApp (Twilio Fase 0). */
export const WHATSAPP_CONVERSATION_CHANNEL = "whatsapp";

/** BSUID Meta/Twilio: `CO.1808175430425940` (país ISO + punto + id). */
const BSUID_RE = /^[A-Za-z]{2}\.\d{6,}$/;
/** Forma rota que guardábamos al quitar el punto y anteponer `+`. */
const MANGLED_BSUID_RE = /^\+?([A-Za-z]{2})(\d{10,})$/;

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
    meta_phone_number_id: raw.meta_phone_number_id ? String(raw.meta_phone_number_id) : null,
    twilio_sender_sid: raw.twilio_sender_sid ? String(raw.twilio_sender_sid) : null,
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

function stripWhatsAppPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed.slice("whatsapp:".length).trim()
    : trimmed;
}

/** ¿Es un Business-Scoped User ID (username WhatsApp sin teléfono visible)? */
export function isWhatsAppBsuid(value: string): boolean {
  const raw = stripWhatsAppPrefix(value);
  if (!raw) return false;
  if (BSUID_RE.test(raw)) return true;
  return MANGLED_BSUID_RE.test(raw);
}

function formatBsuid(country: string, id: string): string {
  return `${country.toUpperCase()}.${id}`;
}

/**
 * Normaliza un destinatario WhatsApp:
 * - E.164 clásico → `+573001234567`
 * - BSUID Twilio/Meta (`whatsapp:CO.1808…` o forma rota `+CO1808…`) → `CO.1808…`
 */
export function normalizeWhatsAppE164(value: string): string {
  const withoutPrefix = stripWhatsAppPrefix(value);
  if (!withoutPrefix) return "";

  if (BSUID_RE.test(withoutPrefix)) {
    const [cc, id] = withoutPrefix.split(".");
    return formatBsuid(cc, id);
  }

  const mangled = withoutPrefix.match(MANGLED_BSUID_RE);
  if (mangled) {
    return formatBsuid(mangled[1], mangled[2]);
  }

  // E.164: quita separadores visuales. Las letras ya se manejaron arriba (BSUID).
  const compact = withoutPrefix.replace(/[\s().-]/g, "");
  if (!compact) return "";
  if (/[A-Za-z]/.test(compact)) {
    // No inventar `+CO…`: deja la forma legible para diagnóstico.
    return compact;
  }
  return compact.startsWith("+") ? compact : `+${compact}`;
}

/** whatsapp:+573001234567 | whatsapp:CO.1808… → forma canónica interna */
export function parseTwilioWhatsAppAddress(value: string): string {
  return normalizeWhatsAppE164(value);
}

/** Forma canónica → dirección Twilio (`whatsapp:+57…` o `whatsapp:CO.1808…`). */
export function toTwilioWhatsAppAddress(address: string): string {
  const normalized = normalizeWhatsAppE164(address);
  if (!normalized) return "";
  if (isWhatsAppBsuid(normalized)) {
    return `whatsapp:${normalized}`;
  }
  const e164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
  return `whatsapp:${e164}`;
}
