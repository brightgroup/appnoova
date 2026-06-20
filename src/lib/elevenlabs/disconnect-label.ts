import type { DisconnectionDetails } from "@elevenlabs/client";

/** Mensajes visibles al cliente — sin referencias a proveedores externos. */
export const PREMIUM_USER_MESSAGES = {
  temporarilyUnavailable:
    "La voz premium no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
  connectionLost:
    "Se interrumpió la conexión de voz. Puedes volver a iniciar la sesión cuando quieras.",
  sessionStartFailed:
    "No fue posible iniciar la sesión. Verifica tu micrófono e inténtalo de nuevo.",
  agentEnded: "El agente finalizó la conversación.",
  userEnded: "Sesión finalizada.",
  reconnecting: "Restableciendo conexión…",
} as const;

const QUOTA_PATTERNS = [
  /quota/i,
  /exceeds your quota/i,
  /insufficient.*credits/i,
  /limit reached/i,
  /rate limit/i,
];

const TECHNICAL_PATTERNS = [
  ...QUOTA_PATTERNS,
  /elevenlabs/i,
  /websocket/i,
  /webrtc/i,
  /livekit/i,
  /token/i,
  /signed.?url/i,
  /api key/i,
  /unauthorized/i,
  /forbidden/i,
  /502|503|429/,
];

export function isQuotaOrBillingError(message?: string | null): boolean {
  const text = message?.trim();
  if (!text) return false;
  return QUOTA_PATTERNS.some(p => p.test(text));
}

function looksTechnical(message?: string | null): boolean {
  const text = message?.trim();
  if (!text) return false;
  if (isQuotaOrBillingError(text)) return true;
  return TECHNICAL_PATTERNS.some(p => p.test(text));
}

export function isQuotaDisconnect(details: DisconnectionDetails): boolean {
  if (details.reason === "error") {
    if (isQuotaOrBillingError(details.message)) return true;
    if (isQuotaOrBillingError(details.closeReason)) return true;
    const code = (details as { code?: number }).code;
    if (code === 1002) return true;
  }
  return false;
}

/** Texto técnico para logs / metadata interna (no mostrar al usuario). */
export function disconnectDetailText(details: DisconnectionDetails | null | undefined): string | null {
  if (!details) return null;
  if (details.reason === "error") return details.message?.trim() || details.closeReason?.trim() || null;
  if (details.reason === "agent") return details.closeReason?.trim() || null;
  return null;
}

/** Mensaje seguro para UI a partir de un error interno del SDK/API. */
export function describePremiumErrorMessage(message: string): string {
  if (isQuotaOrBillingError(message) || looksTechnical(message)) {
    return isQuotaOrBillingError(message)
      ? PREMIUM_USER_MESSAGES.temporarilyUnavailable
      : PREMIUM_USER_MESSAGES.connectionLost;
  }
  return message.trim() || PREMIUM_USER_MESSAGES.connectionLost;
}

export function describePremiumDisconnect(details: DisconnectionDetails): string {
  if (isQuotaDisconnect(details)) {
    return PREMIUM_USER_MESSAGES.temporarilyUnavailable;
  }
  if (details.reason === "user") return PREMIUM_USER_MESSAGES.userEnded;
  if (details.reason === "agent") return PREMIUM_USER_MESSAGES.agentEnded;
  if (details.reason === "error") {
    const raw = details.message?.trim() || details.closeReason?.trim();
    if (raw && !looksTechnical(raw)) return raw;
    return PREMIUM_USER_MESSAGES.connectionLost;
  }
  return PREMIUM_USER_MESSAGES.connectionLost;
}

export function isRecoverableDisconnect(details: DisconnectionDetails): boolean {
  if (isQuotaDisconnect(details)) return false;
  if (details.reason === "error") {
    const msg = `${details.message ?? ""} ${details.closeReason ?? ""}`;
    if (isQuotaOrBillingError(msg)) return false;
    return true;
  }
  if (details.reason === "agent") {
    const code = details.closeCode;
    return code == null || code === 1006 || code === 1011;
  }
  return false;
}

/** Log interno para operaciones — nunca mostrar en UI. */
export function logPremiumInternalIssue(
  context: string,
  detail: Record<string, unknown>
): void {
  console.error(`[premium-voice:${context}]`, detail);
}
