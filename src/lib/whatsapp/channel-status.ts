import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export function isWhatsAppChannelDisconnected(channel: WhatsAppChannelRecord): boolean {
  return channel.status === "suspended" && Boolean(channel.metadata?.disconnected_at);
}

export function whatsAppChannelStatusLabel(channel: Pick<WhatsAppChannelRecord, "status" | "metadata">): string {
  if (channel.status === "active") return "Activo";
  if (isWhatsAppChannelDisconnected(channel as WhatsAppChannelRecord)) return "Desconectado";
  if (channel.status === "suspended") return "Suspendido";
  return "Pendiente";
}

export function whatsAppChannelStatusTone(
  channel: Pick<WhatsAppChannelRecord, "status" | "metadata">
): "active" | "disconnected" | "suspended" | "pending" {
  if (channel.status === "active") return "active";
  if (isWhatsAppChannelDisconnected(channel as WhatsAppChannelRecord)) return "disconnected";
  if (channel.status === "suspended") return "suspended";
  return "pending";
}

/** Solo se puede eliminar tras desconectar (o si nunca estuvo activa). */
export function canDeleteWhatsAppChannel(channel: Pick<WhatsAppChannelRecord, "status" | "metadata">): boolean {
  if (channel.status === "active") return false;
  if (channel.status === "pending") return true;
  return isWhatsAppChannelDisconnected(channel as WhatsAppChannelRecord);
}

export function canDisconnectWhatsAppChannel(channel: Pick<WhatsAppChannelRecord, "status">): boolean {
  return channel.status === "active";
}
