import {
  formatWhatsAppSessionRemaining,
  isWhatsAppSessionOpen
} from "@/lib/whatsapp/session-window";
import type { TextChatMessage } from "@/types/text-agent-conversation";

/** Palabras clave de baja reconocidas por Meta (es/en). */
const OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "UNSUBSCRIBE",
  "CANCEL",
  "CANCELAR",
  "BAJA",
  "DAR DE BAJA",
  "NO MAS",
  "NOMAS",
  "ELIMINAR",
  "QUITAR",
  "OPT OUT",
  "OPTOUT",
  "ARRET",
  "DETENER",
  "PARAR"
]);

export const WHATSAPP_OPT_OUT_CONFIRMATION =
  "Entendido. Has sido dado de baja y no recibirás más mensajes por este canal. Si deseas reactivar, escríbenos de nuevo.";

function normalizeOptOutText(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detecta solicitud explícita de baja (mensaje dedicado o keyword aislada). */
export function detectWhatsAppOptOut(text: string): boolean {
  const normalized = normalizeOptOutText(text);
  if (!normalized) return false;
  if (OPT_OUT_KEYWORDS.has(normalized)) return true;
  for (const kw of OPT_OUT_KEYWORDS) {
    if (normalized === kw) return true;
  }
  // "por favor cancelar" etc. — solo frases cortas con keyword
  if (normalized.length <= 40) {
    for (const kw of OPT_OUT_KEYWORDS) {
      if (normalized.includes(kw)) return true;
    }
  }
  return false;
}

export interface WhatsAppSendGateInput {
  optedOut: boolean;
  lastInboundAt: string | null | undefined;
}

export interface WhatsAppSendGateResult {
  allowed: boolean;
  reason?: string;
  code?: "opted_out" | "session_closed";
}

/** Valida si se puede enviar mensaje de sesión (texto libre) según Meta. */
export function canSendWhatsAppSessionMessage(input: WhatsAppSendGateInput): WhatsAppSendGateResult {
  if (input.optedOut) {
    return {
      allowed: false,
      code: "opted_out",
      reason: "El contacto solicitó darse de baja. No se pueden enviar mensajes hasta que escriba de nuevo."
    };
  }
  if (!isWhatsAppSessionOpen(input.lastInboundAt)) {
    return {
      allowed: false,
      code: "session_closed",
      reason:
        "Ventana de 24 h cerrada. Meta solo permite plantillas aprobadas fuera de sesión (próximamente en Noova)."
    };
  }
  return { allowed: true };
}

export function whatsAppComplianceNotice(
  meta: Record<string, unknown>,
  messages: TextChatMessage[] = []
): string | null {
  const optedOut = meta.whatsapp_opted_out === true;
  const lastInbound = inferWhatsAppLastInboundAt(meta, messages);

  if (optedOut) {
    return "Contacto dado de baja. No se enviarán mensajes salientes hasta que el cliente escriba de nuevo.";
  }
  if (!isWhatsAppSessionOpen(lastInbound)) {
    return "Ventana de 24 h cerrada. Solo el cliente puede reabrirla escribiendo de nuevo.";
  }
  return `Ventana activa · ${formatWhatsAppSessionRemaining(lastInbound)}`;
}

export function inferWhatsAppLastInboundAt(
  meta: Record<string, unknown>,
  messages: TextChatMessage[]
): string | null {
  if (meta.whatsapp_last_inbound_at) {
    return String(meta.whatsapp_last_inbound_at);
  }
  const userMsgs = messages.filter(m => m.role === "user");
  const last = userMsgs[userMsgs.length - 1];
  return last?.created_at ?? null;
}

export function readWhatsAppMeta(
  meta: Record<string, unknown>,
  messages: TextChatMessage[] = []
): {
  lastInboundAt: string | null;
  optedOut: boolean;
} {
  return {
    lastInboundAt: inferWhatsAppLastInboundAt(meta, messages),
    optedOut: meta.whatsapp_opted_out === true
  };
}
