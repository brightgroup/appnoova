import {
  formatWhatsAppSessionRemaining,
  isWhatsAppSessionOpen
} from "@/lib/whatsapp/session-window";
import type { TextChatMessage } from "@/types/text-agent-conversation";

/** Mensaje completo = baja (estándar Meta / sin ambigüedad). */
const EXACT_OPT_OUT = new Set([
  "STOP",
  "UNSUBSCRIBE",
  "OPT OUT",
  "OPTOUT",
  "BAJA",
  "DAR DE BAJA"
]);

/**
 * Frases explícitas de baja del canal WhatsApp.
 * Evita falsos positivos ("cancelar mi pedido", "no más productos", etc.).
 */
const OPT_OUT_PHRASES = [
  "NO ME ESCRIBAN",
  "NO ME ESCRIBAS",
  "NO ME CONTACTEN",
  "NO ME CONTACTES",
  "NO QUIERO MAS MENSAJES",
  "NO QUIERO RECIBIR MENSAJES",
  "NO QUIERO MENSAJES",
  "NO MAS MENSAJES",
  "NO MAS WHATSAPP",
  "DEJAR DE ENVIAR",
  "DEJEN DE ESCRIBIR",
  "DEJA DE ESCRIBIR",
  "DEJEN DE ENVIARME",
  "DEJAR DE ENVIARME",
  "DARME DE BAJA",
  "DARSE DE BAJA",
  "BAJA DE WHATSAPP",
  "CANCELAR SUSCRIPCION",
  "CANCELAR SUBSCRIPTION",
  "SACAME DE LA LISTA",
  "SACARME DE LA LISTA",
  "SACAME DEL LISTADO"
];

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

function trimOptOutCourtesy(text: string): string {
  return text
    .replace(/^(POR FAVOR|PLEASE|PLIS|PLS)\s+/, "")
    .replace(/\s+(POR FAVOR|PLEASE|GRACIAS|THANKS)$/, "")
    .trim();
}

/** Detecta solicitud explícita de baja (palabra dedicada o frase inequívoca). */
export function detectWhatsAppOptOut(text: string): boolean {
  const normalized = normalizeOptOutText(text);
  if (!normalized) return false;

  const exact = trimOptOutCourtesy(normalized);
  if (EXACT_OPT_OUT.has(exact)) return true;

  for (const phrase of OPT_OUT_PHRASES) {
    if (normalized.includes(phrase)) return true;
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
        "Ventana de 24 h cerrada. Usa una plantilla aprobada por Meta para recontactar."
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
