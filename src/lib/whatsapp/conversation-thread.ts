import type { SupabaseClient } from "@supabase/supabase-js";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { toAgentThreadMessage, type AgentThreadMessage } from "@/lib/ai-thread-context";
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
  const e164 = contactE164.trim();
  if (name && e164 && name !== e164 && !/^\+?\d[\d\s()-]{8,}$/.test(name.replace(/\s/g, ""))) {
    return `${name} · ${e164}`;
  }
  if (name) return name;
  return e164;
}

export function messageContentForAi(msg: TextChatMessage): string {
  if (msg.role === "user" && msg.internal_content?.trim()) {
    return msg.internal_content.trim();
  }
  return msg.content;
}

/**
 * Historial completo del hilo para el agente, sin recorte. El mapeo de roles
 * (incluidos los turnos del asesor humano, que antes se descartaban) vive en
 * `toAgentThreadMessage`. Para el camino normal usa `buildAgentThreadContext`,
 * que además aplica la ventana y el resumen rodante.
 */
export function allConversationMessagesForAgent(
  record: TextAgentConversationRecord
): AgentThreadMessage[] {
  return normalizeChatMessages(record.messages)
    .map(toAgentThreadMessage)
    .filter((m): m is AgentThreadMessage => m !== null);
}

export function conversationMessagesForAgent(
  record: TextAgentConversationRecord,
  newUserMessage: string
): AgentThreadMessage[] {
  return [...allConversationMessagesForAgent(record), { role: "user", content: newUserMessage }];
}

export { contactMetaKey };
