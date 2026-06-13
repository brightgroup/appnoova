/** Ventana de servicio Meta WhatsApp: 24 h desde el último mensaje del cliente. */
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWhatsAppSessionOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const ts = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < WHATSAPP_SESSION_WINDOW_MS;
}

export function whatsAppSessionExpiresAt(lastInboundAt: string | null | undefined): string | null {
  if (!lastInboundAt) return null;
  const ts = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts + WHATSAPP_SESSION_WINDOW_MS).toISOString();
}

export function whatsAppSessionRemainingMs(lastInboundAt: string | null | undefined): number {
  if (!lastInboundAt) return 0;
  const expires = new Date(lastInboundAt).getTime() + WHATSAPP_SESSION_WINDOW_MS;
  return Math.max(0, expires - Date.now());
}

export function formatWhatsAppSessionRemaining(lastInboundAt: string | null | undefined): string {
  const ms = whatsAppSessionRemainingMs(lastInboundAt);
  if (ms <= 0) return "Ventana cerrada";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
}
