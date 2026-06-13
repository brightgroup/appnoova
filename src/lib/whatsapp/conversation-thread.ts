import type { SupabaseClient } from "@supabase/supabase-js";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import type { TextAgentConversationRecord, TextChatMessage } from "@/types/text-agent-conversation";

function contactMetaKey(channelId: string, contactE164: string): string {
  return `${channelId}:${contactE164}`;
}

export async function findWhatsAppConversation(
  db: SupabaseClient,
  userId: string,
  channelId: string,
  contactE164: string
): Promise<TextAgentConversationRecord | null> {
  const { data, error } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", WHATSAPP_CONVERSATION_CHANNEL)
    .contains("metadata", {
      whatsapp_channel_id: channelId,
      whatsapp_contact_e164: contactE164
    })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toTextConversationRecord(data);
}

export async function findWhatsAppConversationByMessageSid(
  db: SupabaseClient,
  messageSid: string
): Promise<boolean> {
  const { data } = await db
    .from("text_agent_conversations")
    .select("id")
    .contains("metadata", { last_twilio_message_sid: messageSid })
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export function buildWhatsAppContactLabel(profileName: string | null, contactE164: string): string {
  const name = profileName?.trim();
  if (name) return name;
  return contactE164;
}

export function messageContentForAi(msg: TextChatMessage): string {
  if (msg.role === "user" && msg.internal_content?.trim()) {
    return msg.internal_content.trim();
  }
  return msg.content;
}

export function allConversationMessagesForGemini(
  record: TextAgentConversationRecord
): { role: "user" | "assistant"; content: string }[] {
  return normalizeChatMessages(record.messages)
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.role === "assistant" ? m.content : messageContentForAi(m)
    }))
    .filter(m => m.content.trim());
}

export function conversationMessagesForGemini(
  record: TextAgentConversationRecord,
  newUserMessage: string
): { role: "user" | "assistant"; content: string }[] {
  const history = normalizeChatMessages(record.messages).map(m => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.role === "assistant" ? m.content : messageContentForAi(m)
  }));
  return [...history, { role: "user", content: newUserMessage }];
}

export { contactMetaKey };
