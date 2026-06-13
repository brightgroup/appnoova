import type {
  TextAgentConversationListItem,
  TextAgentConversationRecord,
  TextChatMessage
} from "@/types/text-agent-conversation";
import { normalizeChatMessages } from "@/lib/text-chat-utils";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function toTextConversationRecord(raw: Record<string, unknown>): TextAgentConversationRecord {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    text_agent_id: String(raw.text_agent_id),
    channel: String(raw.channel ?? "web_test"),
    contact_label: String(raw.contact_label ?? "Prueba web"),
    messages_count: num(raw.messages_count),
    user_messages_count: num(raw.user_messages_count),
    duration_sec: num(raw.duration_sec),
    credits: num(raw.credits),
    status: String(raw.status ?? "ended"),
    status_label: String(raw.status_label ?? "Chat finalizado"),
    user_sentiment: String(raw.user_sentiment ?? "Neutral"),
    summary: String(raw.summary ?? ""),
    extracted_data: obj(raw.extracted_data),
    messages: normalizeChatMessages(raw.messages),
    llm_model: String(raw.llm_model ?? "gemini-2.5-flash"),
    metadata: obj(raw.metadata),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ended_at: raw.ended_at ? String(raw.ended_at) : null,
    assigned_to: raw.assigned_to ? String(raw.assigned_to) : null,
    handoff_mode: raw.handoff_mode === "human" ? "human" : "ai",
    unread_count: num(raw.unread_count)
  };
}

export function toTextConversationListItem(raw: Record<string, unknown>): TextAgentConversationListItem {
  const record = toTextConversationRecord(raw);
  return {
    id: record.id,
    text_agent_id: record.text_agent_id,
    channel: record.channel,
    contact_label: record.contact_label,
    messages_count: record.messages_count,
    user_messages_count: record.user_messages_count,
    duration_sec: record.duration_sec,
    credits: record.credits,
    status: record.status,
    status_label: record.status_label,
    user_sentiment: record.user_sentiment,
    summary: record.summary,
    llm_model: record.llm_model,
    metadata: record.metadata,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ended_at: record.ended_at,
    assigned_to: record.assigned_to,
    handoff_mode: record.handoff_mode,
    unread_count: record.unread_count
  };
}

export function mergeChatMessages(
  existing: TextChatMessage[],
  incoming: {
    role: "user" | "assistant" | "human";
    content: string;
    internal_content?: string;
    media_type?: TextChatMessage["media_type"];
    media_label?: string;
    media_storage_path?: string;
    media_mime?: string;
  }[],
  nowIso: string
): TextChatMessage[] {
  const merged = [...existing];
  for (const msg of incoming) {
    const content = msg.content.trim();
    const hasMedia = Boolean(msg.media_storage_path?.trim());
    if (!content && !hasMedia) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && last.content === content) continue;
    merged.push({
      role: msg.role,
      content,
      created_at: nowIso,
      ...(msg.internal_content ? { internal_content: msg.internal_content } : {}),
      ...(msg.media_type ? { media_type: msg.media_type } : {}),
      ...(msg.media_label ? { media_label: msg.media_label } : {}),
      ...(msg.media_storage_path ? { media_storage_path: msg.media_storage_path } : {}),
      ...(msg.media_mime ? { media_mime: msg.media_mime } : {})
    });
  }
  return merged;
}
