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
import { generateMetaAgentReply } from "@/lib/meta-messaging/ai-reply";
import { sendMetaTextMessage, sendMetaTypingOn } from "@/lib/meta-messaging/send";
import { checkBillingForOrg, recordUsageSafe } from "@/lib/billing/meter";
import { providerForLlmModel } from "@/lib/billing/pricing";
import { notifyPushForOrg } from "@/lib/push/send";
import { isTextAgentHumanOnly } from "@/lib/text-agent-form";
import { resolveTextAgentForChannel } from "@/lib/text-agent-resolve";
import {
  detectAssistantHandoffOffer,
  detectUserHandoffIntent,
  escalateConversationToHuman,
  shouldAutoReturnToAi,
  HANDOFF_VISITOR_REPLY
} from "@/lib/text-handoff";
import {
  persistAssistantReplyOnly,
  persistHumanReply,
  persistUserMessageOnly
} from "@/lib/text-conversation-persist";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { withConversationLock } from "@/lib/whatsapp/conversation-lock";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/media-storage";
import type { TextAgentConversationRecord, TextChatMessage } from "@/types/text-agent-conversation";

/**
 * Mensajes entrantes de Messenger / Instagram Direct (conversación con
 * channel = 'messenger' | 'instagram'). Mismo flujo de decisión que WhatsApp:
 * modo humano → sin créditos → cliente pide asesor → respuesta de la IA,
 * sin lo exclusivo de WhatsApp (opt-out STOP, botones, CRM por teléfono).
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

  // Respaldo del dedup por mid: si el echo repite lo último que Noova ya guardó
  // (respuesta de la IA o del asesor), es el reflejo de ese envío, no un mensaje nuevo.
  const lastOutgoing = [...(existing.messages ?? [])].reverse().find(m => m.role !== "user");
  if (lastOutgoing && lastOutgoing.content.trim() === content.text.trim()) return { ok: true };

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

async function sendReply(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  contactId: string,
  body: string
): Promise<{ ok: boolean; sentCount: number; error?: string }> {
  try {
    const { sentCount } = await sendMetaTextMessage({ db, channel, contactId, body });
    return { ok: true, sentCount };
  } catch (err) {
    return { ok: false, sentCount: 0, error: err instanceof Error ? err.message : "Error al enviar" };
  }
}

async function handleCustomerMessage(
  db: SupabaseClient,
  channel: MetaMessagingChannelRecord,
  event: MetaInboundEvent
): Promise<{ ok: boolean; error?: string }> {
  const orgId = channel.organization_id;

  const blocked = await getOrgServiceBlock(db, orgId);
  if (blocked) {
    return { ok: false, error: `Organización ${blocked === "disabled" ? "desactivada" : "suspendida"}` };
  }

  const { agent, error: agentErr } = await resolveTextAgentForChannel(db, channel);
  if (agentErr || !agent) return { ok: false, error: agentErr ?? "Agente de texto no encontrado" };
  const model = String(agent.llm_model || "gemini-2.5-flash");

  const content = await buildInboundContent(db, channel, event);
  if (!content.text) return { ok: false, error: "Mensaje vacío" };
  // La IA todavía no analiza adjuntos de Meta: se le avisa en vez de mostrarle solo el emoji.
  const userForAi = content.mediaLabel
    ? `${content.text}\n\n[El cliente envió un adjunto (${content.mediaLabel}). En este canal aún no puedes verlo: pídele que te cuente por escrito lo que necesitas saber.]`
    : content.text;

  const existing = await findMetaConversation(db, channel, event.contactId);
  const contact = existing ? null : await resolveContactLabel(channel, event.contactId);
  const contactLabel = existing?.contact_label || contact?.label || `Cliente de ${PLATFORM_LABEL[channel.platform]}`;
  const nowIso = new Date().toISOString();

  const metaPatch = {
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
  };

  async function persistInbound(handoffMode: "ai" | "human", statusLabel: string) {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent!.id),
      agentName: String(agent!.name),
      conversationId: existing?.id ?? null,
      userMessage: content.text,
      userInternalContent: userForAi !== content.text ? userForAi : undefined,
      llmModel: model,
      channel: channel.platform,
      contactLabel: contact?.label,
      bumpUnread: true,
      handoffMode,
      statusLabel,
      userMediaType: content.mediaType,
      userMediaLabel: content.mediaLabel,
      userMediaStoragePath: content.mediaStoragePath,
      userMediaMime: content.mediaMime
    });
    if (!persisted.error) {
      await mergeConversationMetadata(db, persisted.conversationId, channel.user_id, metaPatch);
    }
    return persisted;
  }

  function notifyTeam(conversationId: string) {
    void notifyPushForOrg(orgId, {
      title: `${contactLabel} · ${PLATFORM_LABEL[channel.platform]}`,
      body: content.text.length > 120 ? `${content.text.slice(0, 120)}…` : content.text,
      url: `/m/chats/${conversationId}`,
      tag: `msg-${conversationId}`
    });
  }

  const escalate = (conversationId: string, reason: "human_only" | "user_request" | "ai_escalation") =>
    escalateConversationToHuman({
      db,
      userId: channel.user_id,
      conversationId,
      organizationId: orgId,
      reason,
      channel: channel.platform,
      agentName: String(agent.name),
      contactLabel,
      visitorMessage: content.text,
      notifyRules: agent.notify_rules
    });

  // —— Modo humano —— (si nadie respondió a tiempo, vuelve sola a la IA; human_only nunca vuelve)
  const humanOnly = isTextAgentHumanOnly(agent);
  if (humanOnly || (existing?.handoff_mode === "human" && !shouldAutoReturnToAi(existing.messages ?? []))) {
    const persisted = await persistInbound("human", "Esperando asesor");
    if (persisted.error) return { ok: false, error: persisted.error };
    if (humanOnly && existing?.handoff_mode !== "human") {
      await escalate(persisted.conversationId, "human_only");
    } else {
      notifyTeam(persisted.conversationId);
    }
    return { ok: true };
  }

  // —— Sin créditos / suspendida: se registra el mensaje pero no se gasta IA ——
  const billing = await checkBillingForOrg(db, orgId);
  if (!billing.allowed) {
    const persisted = await persistInbound("human", "Sin créditos");
    if (persisted.error) return { ok: false, error: persisted.error };
    notifyTeam(persisted.conversationId);
    return { ok: true };
  }

  // —— El cliente pide un asesor ——
  if (detectUserHandoffIntent(content.text)) {
    const persisted = await persistInbound("human", "Esperando asesor");
    if (persisted.error) return { ok: false, error: persisted.error };
    await persistAssistantReplyOnly({
      db,
      userId: channel.user_id,
      conversationId: persisted.conversationId,
      assistantReply: HANDOFF_VISITOR_REPLY,
      llmModel: model
    });
    await escalate(persisted.conversationId, "user_request");
    const sent = await sendReply(db, channel, event.contactId, HANDOFF_VISITOR_REPLY);
    if (!sent.ok) console.error("[meta-messaging] handoff send:", sent.error);
    return { ok: true };
  }

  // —— Respuesta IA ——
  const persisted = await persistInbound("ai", "Chat activo");
  if (persisted.error) return { ok: false, error: persisted.error };
  const conversationId = persisted.conversationId;

  await sendMetaTypingOn(channel, event.contactId);
  // Meta apaga el "escribiendo…" a los ~20 s: se refresca si la IA tarda más.
  const typingRefresh = setInterval(() => void sendMetaTypingOn(channel, event.contactId), 15_000);

  let generated: Awaited<ReturnType<typeof generateMetaAgentReply>>;
  try {
    const refreshed = await findMetaConversation(db, channel, event.contactId);
    generated = await generateMetaAgentReply({
      db,
      channel,
      agent,
      conversation: refreshed,
      conversationId,
      userForAi,
      contactLabel
    });
  } catch (err) {
    console.error("[meta-messaging] generación falló, escalando a humano:", err instanceof Error ? err.message : err);
    const fallbackReply = "En un momento un asesor te contactará.";
    await persistAssistantReplyOnly({
      db,
      userId: channel.user_id,
      conversationId,
      assistantReply: fallbackReply,
      llmModel: model
    });
    await escalate(conversationId, "ai_escalation");
    const sent = await sendReply(db, channel, event.contactId, fallbackReply);
    if (!sent.ok) console.error("[meta-messaging] fallback send:", sent.error);
    return { ok: true };
  } finally {
    clearInterval(typingRefresh);
  }

  const assistantPersist = await persistAssistantReplyOnly({
    db,
    userId: channel.user_id,
    conversationId,
    assistantReply: generated.reply,
    llmModel: model
  });
  if (!assistantPersist.ok) return { ok: false, error: assistantPersist.error };

  if (generated.catalogNeedsHuman || detectAssistantHandoffOffer(generated.reply)) {
    await escalate(conversationId, "ai_escalation");
  }

  const sent = await sendReply(db, channel, event.contactId, generated.reply);
  if (!sent.ok) {
    console.error("[meta-messaging] send:", sent.error);
    return { ok: false, error: sent.error };
  }

  // Meta no cobra la entrega: una sola línea con el costo real del LLM.
  await recordUsageSafe({
    db,
    organizationId: orgId,
    userId: channel.user_id,
    eventType: "meta_messaging_ai",
    channel: channel.platform,
    provider: providerForLlmModel(generated.engine),
    model: generated.engine,
    gemini: generated.usage,
    referenceType: "text_agent_conversation",
    referenceId: conversationId,
    idempotencyKey: `meta_ai_${event.messageId}`
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
