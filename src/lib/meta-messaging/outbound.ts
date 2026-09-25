import type { SupabaseClient } from "@supabase/supabase-js";
import { metaSendWindow, sendMetaTextMessage } from "@/lib/meta-messaging/send";
import type { MetaMessagingChannelRecord, MetaMessagingPlatform } from "@/lib/meta-messaging/types";

export function isMetaMessagingChannel(channel: string): channel is MetaMessagingPlatform {
  return channel === "messenger" || channel === "instagram";
}

/**
 * Chequeo previo a guardar la respuesta del asesor (mismo rol que la ventana
 * de 24 h de WhatsApp en /api/inbox/reply): pasados 7 días desde el último
 * mensaje del cliente, Meta no deja escribirle.
 */
export function metaHumanReplyGate(
  metadata: Record<string, unknown> | null | undefined
): { allowed: boolean; error?: string; code?: string } {
  const lastInboundAt = metadata?.meta_last_inbound_at ? String(metadata.meta_last_inbound_at) : null;
  if (metaSendWindow(lastInboundAt) === "closed") {
    return {
      allowed: false,
      code: "session_closed",
      error: "Pasaron más de 7 días desde el último mensaje del cliente. Meta no permite escribirle hasta que vuelva a escribir."
    };
  }
  return { allowed: true };
}

/**
 * Envía la respuesta de un asesor desde el inbox. Entre 24 h y 7 días se usa
 * la etiqueta HUMAN_AGENT (solo válida para respuestas humanas). Meta no cobra
 * la entrega, así que no se registra consumo.
 */
export async function sendMetaOutboundForConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  body: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const { data: conv } = await db
    .from("text_agent_conversations")
    .select("channel, metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversación no encontrada" };

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const channelId = meta.meta_channel_id ? String(meta.meta_channel_id) : "";
  const contactId = meta.meta_contact_id ? String(meta.meta_contact_id) : "";
  if (!channelId || !contactId) return { ok: false, error: "Conversación sin datos de contacto de Meta" };

  const gate = metaHumanReplyGate(meta);
  if (!gate.allowed) return { ok: false, error: gate.error, code: gate.code };
  const window = metaSendWindow(meta.meta_last_inbound_at ? String(meta.meta_last_inbound_at) : null);

  const { data: channel } = await db
    .from("meta_messaging_channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || (channel as MetaMessagingChannelRecord).status !== "active") {
    return { ok: false, error: "El canal de Meta está desconectado. Reconéctalo en Canales → Messenger e Instagram." };
  }

  try {
    await sendMetaTextMessage({
      db,
      channel: channel as MetaMessagingChannelRecord,
      contactId,
      body,
      humanAgentTag: window === "human_agent"
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al enviar por Meta" };
  }
}
