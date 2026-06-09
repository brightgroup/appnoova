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
