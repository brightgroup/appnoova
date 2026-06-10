import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildChatFallbackSummary,
  estimateChatCredits,
  normalizeChatMessages
} from "@/lib/text-chat-utils";
import { mergeChatMessages } from "@/lib/text-conversation-record";
import { deriveTextQualityLabel } from "@/lib/text-agent-display";
import type { TextChatMessage } from "@/types/text-agent-conversation";

interface PersistChatTurnInput {
  db: SupabaseClient;
  userId: string;
  agentId: string;
  agentName: string;
  conversationId?: string | null;
  userMessage: string;
  assistantReply: string;
  llmModel: string;
  channel?: string;
  contactLabel?: string;
}

export async function persistChatTurn(input: PersistChatTurnInput): Promise<{
  conversationId: string;
  error?: string;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  const channel = input.channel ?? "web_test";
  const contactLabel = input.contactLabel ?? "Prueba web";

  let conversationId = input.conversationId ?? null;
  let isNew = false;

  if (conversationId) {
    const { data: existing } = await input.db
      .from("text_agent_conversations")
      .select("id, messages, created_at, summary")
      .eq("id", conversationId)
      .eq("user_id", input.userId)
      .eq("text_agent_id", input.agentId)
      .maybeSingle();

    if (!existing) conversationId = null;
  }

  const incoming = [
    { role: "user" as const, content: input.userMessage },
    { role: "assistant" as const, content: input.assistantReply }
  ];

  if (!conversationId) {
    isNew = true;
    const messages: TextChatMessage[] = mergeChatMessages([], incoming, nowIso);
    const messagesCount = messages.length;
    const userMessagesCount = messages.filter(m => m.role === "user").length;

    const { data, error } = await input.db
      .from("text_agent_conversations")
      .insert({
        user_id: input.userId,
        text_agent_id: input.agentId,
        channel,
        contact_label: contactLabel,
        messages_count: messagesCount,
        user_messages_count: userMessagesCount,
        duration_sec: 0,
        credits: estimateChatCredits(messagesCount),
        status: "active",
        status_label: "Chat activo",
        summary: buildChatFallbackSummary(messages),
        messages,
        llm_model: input.llmModel,
        metadata: {
          source: channel,
          agent_name: input.agentName
        },
        updated_at: nowIso
      })
      .select("id")
      .single();

    if (error) return { conversationId: "", error: error.message };
    conversationId = String(data.id);
  } else {
    const { data: row, error: fetchErr } = await input.db
      .from("text_agent_conversations")
      .select("messages, created_at")
      .eq("id", conversationId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { conversationId: conversationId ?? "", error: fetchErr?.message ?? "Conversación no encontrada" };
    }

    const existingMessages = normalizeChatMessages(row.messages);
    const messages = mergeChatMessages(existingMessages, incoming, nowIso);
    const messagesCount = messages.length;
    const userMessagesCount = messages.filter(m => m.role === "user").length;
    const durationSec = Math.max(
      0,
      Math.round((now.getTime() - new Date(String(row.created_at)).getTime()) / 1000)
    );

    const { error: updateErr } = await input.db
      .from("text_agent_conversations")
      .update({
        messages,
        messages_count: messagesCount,
        user_messages_count: userMessagesCount,
        duration_sec: durationSec,
        credits: estimateChatCredits(messagesCount),
        summary: buildChatFallbackSummary(messages),
        llm_model: input.llmModel,
        updated_at: nowIso
      })
      .eq("id", conversationId)
      .eq("user_id", input.userId);

    if (updateErr) return { conversationId, error: updateErr.message };
  }

  await bumpAgentStats(input.db, input.agentId, input.userId, {
    newConversation: isNew,
    messageDelta: 2
  });

  return { conversationId: conversationId! };
}

interface PersistUserOnlyInput {
  db: SupabaseClient;
  userId: string;
  agentId: string;
  agentName: string;
  conversationId?: string | null;
  userMessage: string;
  llmModel: string;
  channel?: string;
  contactLabel?: string;
  bumpUnread?: boolean;
}

/** Guarda solo el mensaje del visitante (modo humano / sin respuesta IA). */
export async function persistUserMessageOnly(input: PersistUserOnlyInput): Promise<{
  conversationId: string;
  error?: string;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  const channel = input.channel ?? "web_test";
  const contactLabel = input.contactLabel ?? "Prueba web";
  const incoming = [{ role: "user" as const, content: input.userMessage }];

  let conversationId = input.conversationId ?? null;
  let isNew = false;

  if (conversationId) {
    const { data: existing } = await input.db
      .from("text_agent_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", input.userId)
      .eq("text_agent_id", input.agentId)
      .maybeSingle();
    if (!existing) conversationId = null;
  }

  if (!conversationId) {
    isNew = true;
    const messages: TextChatMessage[] = mergeChatMessages([], incoming, nowIso);
    const messagesCount = messages.length;
    const { data, error } = await input.db
      .from("text_agent_conversations")
      .insert({
        user_id: input.userId,
        text_agent_id: input.agentId,
        channel,
        contact_label: contactLabel,
        messages_count: messagesCount,
        user_messages_count: 1,
        duration_sec: 0,
        credits: estimateChatCredits(messagesCount),
        status: "active",
        status_label: "Esperando asesor",
        summary: buildChatFallbackSummary(messages),
        messages,
        llm_model: input.llmModel,
        handoff_mode: "human",
        unread_count: input.bumpUnread === false ? 0 : 1,
        metadata: { source: channel, agent_name: input.agentName },
        updated_at: nowIso
      })
      .select("id")
      .single();

    if (error) return { conversationId: "", error: error.message };
    conversationId = String(data.id);
  } else {
    const { data: row, error: fetchErr } = await input.db
      .from("text_agent_conversations")
      .select("messages, created_at, unread_count")
      .eq("id", conversationId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { conversationId: conversationId ?? "", error: fetchErr?.message ?? "Conversación no encontrada" };
    }

    const messages = mergeChatMessages(normalizeChatMessages(row.messages), incoming, nowIso);
    const messagesCount = messages.length;
    const userMessagesCount = messages.filter(m => m.role === "user").length;
    const durationSec = Math.max(
      0,
      Math.round((now.getTime() - new Date(String(row.created_at)).getTime()) / 1000)
    );
    const unread = (Number(row.unread_count) || 0) + (input.bumpUnread === false ? 0 : 1);

    const { error: updateErr } = await input.db
      .from("text_agent_conversations")
      .update({
        messages,
        messages_count: messagesCount,
        user_messages_count: userMessagesCount,
        duration_sec: durationSec,
        credits: estimateChatCredits(messagesCount),
        summary: buildChatFallbackSummary(messages),
        status_label: "Esperando asesor",
        unread_count: unread,
        updated_at: nowIso
      })
      .eq("id", conversationId)
      .eq("user_id", input.userId);

    if (updateErr) return { conversationId, error: updateErr.message };
  }

  await bumpAgentStats(input.db, input.agentId, input.userId, {
    newConversation: isNew,
    messageDelta: 1
  });

  return { conversationId: conversationId! };
}

interface PersistHumanReplyInput {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  content: string;
  assignedTo: string;
}

export async function persistHumanReply(input: PersistHumanReplyInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const nowIso = new Date().toISOString();
  const { data: row, error: fetchErr } = await input.db
    .from("text_agent_conversations")
    .select("messages, created_at, text_agent_id")
    .eq("id", input.conversationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Conversación no encontrada" };
  }

  const messages = mergeChatMessages(
    normalizeChatMessages(row.messages),
    [{ role: "human", content: input.content }],
    nowIso
  );
  const messagesCount = messages.length;
  const durationSec = Math.max(
    0,
    Math.round((new Date().getTime() - new Date(String(row.created_at)).getTime()) / 1000)
  );

  const { error: updateErr } = await input.db
    .from("text_agent_conversations")
    .update({
      messages,
      messages_count: messagesCount,
      duration_sec: durationSec,
      credits: estimateChatCredits(messagesCount),
      summary: buildChatFallbackSummary(messages),
      handoff_mode: "human",
      assigned_to: input.assignedTo,
      status_label: "Atendido por humano",
      updated_at: nowIso
    })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  if (updateErr) return { ok: false, error: updateErr.message };

  await bumpAgentStats(input.db, String(row.text_agent_id), input.userId, {
    newConversation: false,
    messageDelta: 1
  });

  return { ok: true };
}

async function bumpAgentStats(
  db: SupabaseClient,
  agentId: string,
  userId: string,
  opts: { newConversation: boolean; messageDelta: number }
) {
  const { data: agent } = await db
    .from("text_agents")
    .select("conversations_count, messages_count")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) return;

  const conversations = (Number(agent.conversations_count) || 0) + (opts.newConversation ? 1 : 0);
  const messages = (Number(agent.messages_count) || 0) + opts.messageDelta;

  await db
    .from("text_agents")
    .update({
      conversations_count: conversations,
      messages_count: messages,
      quality_label: deriveTextQualityLabel(conversations),
      updated_at: new Date().toISOString()
    })
    .eq("id", agentId)
    .eq("user_id", userId);
}
