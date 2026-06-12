import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOriApiKey } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import {
  persistChatTurn,
  persistUserMessageOnly
} from "@/lib/text-conversation-persist";
import {
  buildWhatsAppContactLabel,
  conversationMessagesForGemini,
  findWhatsAppConversation
} from "@/lib/whatsapp/conversation-thread";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp/twilio-whatsapp";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";

export interface TwilioWhatsAppInbound {
  messageSid: string;
  fromE164: string;
  toE164: string;
  body: string;
  profileName: string | null;
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

  const trimmedBody = inbound.body.trim();
  if (!trimmedBody) {
    return { ok: true };
  }

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

  if (existing?.handoff_mode === "human") {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing.id,
      userMessage: trimmedBody,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      contactLabel,
      bumpUnread: true
    });

    if (persisted.error) return { ok: false, error: persisted.error };

    await db
      .from("text_agent_conversations")
      .update({
        metadata: {
          ...(existing.metadata ?? {}),
          whatsapp_channel_id: channel.id,
          whatsapp_contact_e164: inbound.fromE164,
          last_twilio_message_sid: inbound.messageSid
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", persisted.conversationId)
      .eq("user_id", channel.user_id);

    return { ok: true };
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return { ok: false, error: "ORI_GOOGLE_AI_KEY no configurada" };
  }

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

  const historyMessages = existing
    ? conversationMessagesForGemini(existing, trimmedBody)
    : [{ role: "user" as const, content: trimmedBody }];

  const systemInstruction = mergeCompanyContext(String(agent.prompt), companyContextText);
  const ai = new GoogleGenAI({ apiKey });

  let reply: string;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: historyMessages.map(m => ({
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

  const persisted = await persistChatTurn({
    db,
    userId: channel.user_id,
    agentId: String(agent.id),
    agentName: String(agent.name),
    conversationId: existing?.id ?? null,
    userMessage: trimmedBody,
    assistantReply: reply,
    llmModel: model,
    channel: WHATSAPP_CONVERSATION_CHANNEL,
    contactLabel: existing ? undefined : contactLabel
  });

  if (persisted.error) return { ok: false, error: persisted.error };

  await db
    .from("text_agent_conversations")
    .update({
      metadata: {
        whatsapp_channel_id: channel.id,
        whatsapp_contact_e164: inbound.fromE164,
        last_twilio_message_sid: inbound.messageSid
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", persisted.conversationId)
    .eq("user_id", channel.user_id);

  try {
    await sendTwilioWhatsAppMessage({
      toE164: inbound.fromE164,
      fromE164: channel.e164,
      messagingServiceSid: channel.twilio_messaging_service_sid,
      body: reply
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar WhatsApp";
    console.error("[whatsapp/inbound] send:", msg);
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export async function sendWhatsAppOutboundForConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
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
