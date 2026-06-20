import type { DisconnectionDetails } from "@elevenlabs/client";

export function describePremiumDisconnect(details: DisconnectionDetails): string {
  if (details.reason === "user") return "Sesión finalizada por ti.";
  if (details.reason === "agent") return "El agente cerró la conversación.";
  if (details.reason === "error") {
    const msg = details.message?.trim();
    if (msg) return msg;
    if (details.closeReason?.trim()) return details.closeReason;
    return "Se perdió la conexión con el servicio de voz.";
  }
  return "Conexión interrumpida.";
}

export function isRecoverableDisconnect(details: DisconnectionDetails): boolean {
  if (details.reason === "error") return true;
  // Agent hangup in web test is usually timeout/network — allow one retry.
  if (details.reason === "agent") {
    const code = details.closeCode;
    return code == null || code === 1006 || code === 1011;
  }
  return false;
}
