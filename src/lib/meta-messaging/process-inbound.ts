import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgServiceBlock } from "@/lib/billing/org-service-gate";
import { decryptToken } from "@/lib/crypto/token-cipher";
import { getMetaAppId } from "@/lib/meta/graph-config";
import { downloadMetaAttachment, fetchMetaContactProfile } from "@/lib/meta-messaging/graph";
import type {
  MetaInboundAttachment,
  MetaInboundEvent,
  MetaMessagingChannelRecord
} from "@/lib/meta-messaging/types";
import { notifyPushForOrg } from "@/lib/push/send";
import { persistHumanReply, persistUserMessageOnly } from "@/lib/text-conversation-persist";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { withConversationLock } from "@/lib/whatsapp/conversation-lock";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/media-storage";
import type { TextAgentConversationRecord, TextChatMessage } from "@/types/text-agent-conversation";

/**
 * Fase 1 de Messenger / Instagram Direct: cada mensaje entrante queda en el
 * inbox (conversación con channel = 'messenger' | 'instagram') en cola de
 * asesor. La respuesta automática de la IA y el envío de salida llegan en la
 * siguiente fase — por eso aquí no se llama al LLM ni se descuentan créditos.
 */

const PLATFORM_LABEL = { messenger: "Messenger", instagram: "Instagram" } as const;

async function findMetaConversation(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  contactId: string
): Promise<TextAgentConversationRecord | null> {
  const { data, error } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("user_id", channel.user_id)
    .eq("channel", channel.platform)
    .contains("metadata", { meta_channel_id: channel.id, meta_contact_id: contactId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toTextConversationRecord(data);
}

async function mergeConversationMetadata(
  db: SupabaseClient,
  conversationId: string,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { data } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const prior = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  await db
    .from("text_agent_conversations")
    .update({ metadata: { ...prior, ...patch }, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

function mediaTypeFor(att: MetaInboundAttachment): TextChatMessage["media_type"] {
  switch (att.type) {
    case "image":
    case "story_mention":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      return "document";
  }
}

const ATTACHMENT_LABEL: Record<MetaInboundAttachment["type"], string> = {
  image: "📷 Imagen",
  video: "🎬 Video",
  audio: "🎤 Audio",
  file: "📎 Archivo",
  story_mention: "📣 Te mencionó en su historia",
  other: "📎 Adjunto"
};

interface InboundContent {
  text: string;
  mediaType?: TextChatMessage["media_type"];
  mediaLabel?: string;
  mediaStoragePath?: string;
  mediaMime?: string;
}

/** Texto visible + primer adjunto guardado en storage (las URLs de Meta caducan). */
async function buildInboundContent(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  event: MetaInboundEvent
): Promise<InboundContent> {
  const parts: string[] = [];
  if (event.storyReplyUrl) parts.push("↩️ Respondió a tu historia:");
  if (event.text) parts.push(event.text);

  const first = event.attachments[0];
  if (!first) return { text: parts.join(" ").trim() };

  const label = ATTACHMENT_LABEL[first.type];
  if (!event.text) parts.push(label);

  const content: InboundContent = { text: parts.join(" ").trim(), mediaLabel: label };
  if (!first.url) return content;

  const file = await downloadMetaAttachment(first.url);
  if (!file) return content;

  const path = await uploadWhatsAppMedia(db, channel.user_id, event.messageId, 0, file.buffer, file.contentType);
  if (!path) return content;

  return {
    ...content,
    mediaType: mediaTypeFor(first),
    mediaStoragePath: path,
    mediaMime: file.contentType
  };
}

async function resolveContactLabel(
  channel: MetaMessagingChannelRecord,
  contactId: string
): Promise<{ label: string; username: string | null; profilePicUrl: string | null }> {
  let token: string;
  try {
    token = decryptToken(channel.page_access_token_enc);
  } catch (err) {
    console.error("[meta-messaging] token:", err);
    return { label: `Cliente de ${PLATFORM_LABEL[channel.platform]}`, username: null, profilePicUrl: null };
  }

  const profile = await fetchMetaContactProfile(channel.platform, contactId, token);
  const label =
    profile.name && profile.username
      ? `${profile.name} · @${profile.username}`
      : profile.name || (profile.username ? `@${profile.username}` : `Cliente de ${PLATFORM_LABEL[channel.platform]}`);
  return { label, username: profile.username, profilePicUrl: profile.profilePicUrl };
}

async function handleEcho(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  event: MetaInboundEvent
): Promise<{ ok: boolean; error?: string }> {
  // Enviado por Noova: ya quedó guardado al enviarlo.
  const ownAppId = getMetaAppId();
  if (event.echoAppId && ownAppId && event.echoAppId === ownAppId) return { ok: true };

  // Alguien respondió desde Meta Business Suite / la app de Instagram: se
  // refleja en el inbox y la conversación pasa a modo humano (la IA no se cruza).
  const existing = await findMetaConversation(db, channel, event.contactId);
  if (!existing) return { ok: true };

  const content = await buildInboundContent(db, channel, event);
  if (!content.text && !content.mediaStoragePath) return { ok: true };

  return persistHumanReply({
    db,
    userId: channel.user_id,
    conversationId: existing.id,
    content: content.text || content.mediaLabel || "",
    assignedTo: channel.connected_by_user_id ?? channel.user_id,
    mediaType: content.mediaType,
    mediaLabel: content.mediaLabel,
    mediaStoragePath: content.mediaStoragePath,
    mediaMime: content.mediaMime
  });
}

async function handleCustomerMessage(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  event: MetaInboundEvent
): Promise<{ ok: boolean; error?: string }> {
  if (!channel.text_agent_id) return { ok: false, error: "Canal sin agente de texto asignado" };

  const blocked = await getOrgServiceBlock(db, channel.organization_id);
  if (blocked) {
    return { ok: false, error: `Organización ${blocked === "disabled" ? "desactivada" : "suspendida"}` };
  }

  const { data: agent } = await db
    .from("text_agents")
    .select("id, name, llm_model")
    .eq("id", channel.text_agent_id)
    .maybeSingle();
  if (!agent) return { ok: false, error: "Agente de texto no encontrado" };

  const content = await buildInboundContent(db, channel, event);
  if (!content.text) return { ok: false, error: "Mensaje vacío" };

  const existing = await findMetaConversation(db, channel, event.contactId);
  const contact = existing ? null : await resolveContactLabel(channel, event.contactId);
  const nowIso = new Date().toISOString();

  const persisted = await persistUserMessageOnly({
    db,
    userId: channel.user_id,
    agentId: String(agent.id),
    agentName: String(agent.name),
    conversationId: existing?.id ?? null,
    userMessage: content.text,
    llmModel: String(agent.llm_model || "gemini-2.5-flash"),
    channel: channel.platform,
    contactLabel: contact?.label,
    bumpUnread: true,
    handoffMode: "human",
    statusLabel: "Esperando asesor",
    userMediaType: content.mediaType,
    userMediaLabel: content.mediaLabel,
    userMediaStoragePath: content.mediaStoragePath,
    userMediaMime: content.mediaMime
  });
  if (persisted.error) return { ok: false, error: persisted.error };

  await mergeConversationMetadata(db, persisted.conversationId, channel.user_id, {
    meta_channel_id: channel.id,
    meta_platform: channel.platform,
    meta_contact_id: event.contactId,
    // Ventana de 24 h de Meta: se mide desde el último mensaje del cliente.
    meta_last_inbound_at: nowIso,
    last_meta_message_id: event.messageId,
    ...(contact?.username ? { meta_contact_username: contact.username } : {}),
    ...(contact?.profilePicUrl ? { meta_contact_profile_pic: contact.profilePicUrl } : {}),
    ...(event.referral ? { meta_last_referral: event.referral } : {}),
    ...(event.postbackPayload ? { meta_last_postback: event.postbackPayload } : {}),
    ...(event.quickReplyPayload ? { meta_last_quick_reply: event.quickReplyPayload } : {})
  });

  const label = existing?.contact_label || contact?.label || "Nuevo mensaje";
  void notifyPushForOrg(channel.organization_id, {
    title: `${label} · ${PLATFORM_LABEL[channel.platform]}`,
    body: content.text.length > 120 ? `${content.text.slice(0, 120)}…` : content.text,
    url: `/m/chats/${persisted.conversationId}`,
    tag: `msg-${persisted.conversationId}`
  });

  return { ok: true };
}

export async function processMetaMessagingInbound(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  event: MetaInboundEvent
): Promise<{ ok: boolean; error?: string }> {
  return withConversationLock(`${channel.id}:${event.contactId}`, () =>
    event.kind === "echo" ? handleEcho(db, channel, event) : handleCustomerMessage(db, channel, event)
  );
}
