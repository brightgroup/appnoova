import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOriApiKey } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import {
  persistAssistantReplyOnly,
  persistUserMessageOnly
} from "@/lib/text-conversation-persist";
import {
  allConversationMessagesForGemini,
  buildWhatsAppContactLabel,
  findWhatsAppConversation
} from "@/lib/whatsapp/conversation-thread";
import { mergeWhatsAppMetadata } from "@/lib/whatsapp/conversation-meta";
import {
  canSendWhatsAppSessionMessage,
  detectWhatsAppOptOut,
  readWhatsAppMeta,
  WHATSAPP_OPT_OUT_CONFIRMATION
} from "@/lib/whatsapp/compliance";
import { buildWhatsAppInboundContent } from "@/lib/whatsapp/media-understanding";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp/twilio-whatsapp";
import type { TwilioWhatsAppMediaItem } from "@/lib/whatsapp/twilio-media";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import type { TextChatMessage } from "@/types/text-agent-conversation";

export interface TwilioWhatsAppInbound {
  messageSid: string;
  fromE164: string;
  toE164: string;
  body: string;
  profileName: string | null;
  media: TwilioWhatsAppMediaItem[];
}

async function updateWhatsAppConversationMetadata(
  db: SupabaseClient,
  conversationId: string,
  userId: string,
  existingMeta: Record<string, unknown> | undefined,
  patch: Parameters<typeof mergeWhatsAppMetadata>[1]
): Promise<void> {
  await db
    .from("text_agent_conversations")
    .update({
      metadata: mergeWhatsAppMetadata(existingMeta, patch),
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

async function sendWhatsAppIfAllowed(
  channel: WhatsAppChannelRecord,
  toE164: string,
  body: string,
  lastInboundAt: string,
  optedOut: boolean
): Promise<{ ok: boolean; error?: string }> {
  const gate = canSendWhatsAppSessionMessage({ lastInboundAt, optedOut });
  if (!gate.allowed) {
    return { ok: false, error: gate.reason };
  }

  try {
    await sendTwilioWhatsAppMessage({
      toE164,
      fromE164: channel.e164,
      messagingServiceSid: channel.twilio_messaging_service_sid,
      body
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar WhatsApp";
    return { ok: false, error: msg };
  }
}

export async function processTwilioWhatsAppInbound(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord,
  inbound: TwilioWhatsAppInbound
): Promise<{ ok: boolean; error?: string }> {
  if (channel.status !== "active") {
    return { ok: false, error: "Canal WhatsApp no activo" };
  }

  if (!channel.text_agent_id) {
    return { ok: false, error: "Canal sin agente de texto asignado" };
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return { ok: false, error: "ORI_GOOGLE_AI_KEY no configurada" };
  }

  const inboundContent = await buildWhatsAppInboundContent(
    apiKey,
    inbound.body,
    inbound.media,
    { db, userId: channel.user_id, messageSid: inbound.messageSid }
  );

  if (!inboundContent.userText.trim()) {
    return { ok: false, error: "Mensaje vacío o media no procesable" };
  }

  const nowIso = new Date().toISOString();
  const userDisplay = inboundContent.userVisible;
  const userForAi = inboundContent.userText;
  const userInternalContent =
    userForAi.trim() !== userDisplay.trim() ? userForAi : undefined;
  const userMediaType: TextChatMessage["media_type"] =
    inboundContent.primaryMediaType ?? (inbound.media.length ? "document" : "text");
  const userMediaLabel = inboundContent.mediaLabel;

  const { data: agent, error: agentErr } = await db
    .from("text_agents")
    .select("*")
    .eq("id", channel.text_agent_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (agentErr || !agent) {
    return { ok: false, error: "Agente de texto no encontrado" };
  }

  const model = String(agent.llm_model || "gemini-2.5-flash");
  const contactLabel = buildWhatsAppContactLabel(inbound.profileName, inbound.fromE164);
  const existing = await findWhatsAppConversation(
    db,
    channel.user_id,
    channel.id,
    inbound.fromE164
  );

  const priorMeta = readWhatsAppMeta(existing?.metadata ?? {}, existing?.messages ?? []);
  const isOptOutRequest = detectWhatsAppOptOut(userForAi);
  const reEngaged = priorMeta.optedOut && !isOptOutRequest;
  const optedOutAfter = isOptOutRequest ? true : reEngaged ? false : priorMeta.optedOut;

  const metaPatch = {
    whatsapp_channel_id: channel.id,
    whatsapp_contact_e164: inbound.fromE164,
    last_twilio_message_sid: inbound.messageSid,
    whatsapp_last_inbound_at: nowIso,
    whatsapp_opted_out: optedOutAfter,
    whatsapp_opted_out_at: isOptOutRequest ? nowIso : reEngaged ? null : priorMeta.optedOut ? (existing?.metadata?.whatsapp_opted_out_at as string | null) ?? null : null
  };

  const persistOpts = {
    userMediaType: inbound.media.length ? userMediaType : undefined,
    userMediaLabel,
    userMediaStoragePath: inboundContent.mediaStoragePath,
    userMediaMime: inboundContent.mediaMime,
    userInternalContent
  };

  // —— Baja (STOP / CANCELAR) ——
  if (isOptOutRequest) {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing?.id ?? null,
      userMessage: userDisplay,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      contactLabel: existing ? undefined : contactLabel,
      bumpUnread: true,
      ...persistOpts
    });

    if (persisted.error) return { ok: false, error: persisted.error };

    await updateWhatsAppConversationMetadata(
      db,
      persisted.conversationId,
      channel.user_id,
      existing?.metadata,
      metaPatch
    );

    await sendWhatsAppIfAllowed(
      channel,
      inbound.fromE164,
      WHATSAPP_OPT_OUT_CONFIRMATION,
      nowIso,
      false
    );

    return { ok: true };
  }

  // —— Modo humano ——
  if (existing?.handoff_mode === "human") {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing.id,
      userMessage: userDisplay,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      bumpUnread: true,
      ...persistOpts
    });

    if (persisted.error) return { ok: false, error: persisted.error };

    await updateWhatsAppConversationMetadata(
      db,
      persisted.conversationId,
      channel.user_id,
      existing.metadata,
      metaPatch
    );

    return { ok: true };
  }

  // —— Respuesta IA (usuario primero, asistente después) ——
  let companyContextText = "";
  if (agent.company_context_id) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", agent.company_context_id)
      .eq("user_id", channel.user_id)
      .maybeSingle();
    companyContextText = String(ctx?.content ?? "");
  }

  const userPersist = await persistUserMessageOnly({
    db,
    userId: channel.user_id,
    agentId: String(agent.id),
    agentName: String(agent.name),
    conversationId: existing?.id ?? null,
    userMessage: userDisplay,
    llmModel: model,
    channel: WHATSAPP_CONVERSATION_CHANNEL,
    contactLabel: existing ? undefined : contactLabel,
    bumpUnread: true,
    handoffMode: "ai",
    statusLabel: "Chat activo",
    ...persistOpts
  });

  if (userPersist.error) return { ok: false, error: userPersist.error };

  await updateWhatsAppConversationMetadata(
    db,
    userPersist.conversationId,
    channel.user_id,
    existing?.metadata,
    metaPatch
  );

  const refreshed = await findWhatsAppConversation(
    db,
    channel.user_id,
    channel.id,
    inbound.fromE164
  );

  const geminiContents = refreshed
    ? allConversationMessagesForGemini(refreshed)
    : [{ role: "user" as const, content: userForAi }];

  const systemInstruction = mergeCompanyContext(String(agent.prompt), companyContextText);
  const ai = new GoogleGenAI({ apiKey });

  let reply: string;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: geminiContents.map(m => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction,
        temperature: geminiTextTemperature(Number(agent.temperature) || 0.7),
        maxOutputTokens: Number(agent.max_output_tokens) || 2048
      }
    });
    reply = response.text?.trim() ?? "";
    if (!reply) return { ok: false, error: "IA sin respuesta" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error IA";
    return { ok: false, error: msg };
  }

  const assistantPersist = await persistAssistantReplyOnly({
    db,
    userId: channel.user_id,
    conversationId: userPersist.conversationId,
    assistantReply: reply,
    llmModel: model
  });

  if (!assistantPersist.ok) {
    return { ok: false, error: assistantPersist.error };
  }

  const sendResult = await sendWhatsAppIfAllowed(
    channel,
    inbound.fromE164,
    reply,
    nowIso,
    optedOutAfter
  );

  if (!sendResult.ok) {
    console.error("[whatsapp/inbound] send:", sendResult.error);
    return { ok: false, error: sendResult.error };
  }

  return { ok: true };
}

export async function sendWhatsAppOutboundForConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  body: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const { data: conv, error: convErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convErr || !conv) {
    return { ok: false, error: "Conversación no encontrada" };
  }

  if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
    return { ok: true };
  }

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const channelId = meta.whatsapp_channel_id ? String(meta.whatsapp_channel_id) : "";
  const contactE164 = meta.whatsapp_contact_e164 ? String(meta.whatsapp_contact_e164) : "";
  const waMeta = readWhatsAppMeta(meta, normalizeChatMessages(conv.messages));

  const gate = canSendWhatsAppSessionMessage({
    lastInboundAt: waMeta.lastInboundAt,
    optedOut: waMeta.optedOut
  });
  if (!gate.allowed) {
    return { ok: false, error: gate.reason, code: gate.code };
  }

  if (!channelId || !contactE164) {
    return { ok: false, error: "Conversación WhatsApp sin metadatos de contacto" };
  }

  const { data: channelRow, error: chErr } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (chErr || !channelRow) {
    return { ok: false, error: "Canal WhatsApp no encontrado" };
  }

  try {
    await sendTwilioWhatsAppMessage({
      toE164: contactE164,
      fromE164: String(channelRow.e164),
      messagingServiceSid: channelRow.twilio_messaging_service_sid
        ? String(channelRow.twilio_messaging_service_sid)
        : null,
      body
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar WhatsApp";
    return { ok: false, error: msg };
  }
}
