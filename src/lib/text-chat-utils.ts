import type { TextChatMessage } from "@/types/text-agent-conversation";

export function formatChatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).replace(",", "");
}

export function formatChatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

export function formatChatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function estimateChatCredits(messagesCount: number): number {
  return Math.max(1, Math.round(messagesCount * 0.5));
}

export function chatQualityPercent(conv: {
  messages_count: number;
  user_messages_count: number;
  duration_sec: number;
  user_sentiment: string;
}): number {
  let score = 60;
  if (conv.messages_count >= 4) score += 10;
  if (conv.messages_count >= 8) score += 10;
  if (conv.user_messages_count >= 2) score += 5;
  if (conv.duration_sec >= 60) score += 5;
  if (conv.user_sentiment === "Positivo") score += 15;
  if (conv.user_sentiment === "Negativo") score -= 15;
  return Math.min(100, Math.max(25, score));
}

export function isSuccessfulChat(conv: {
  messages_count: number;
  user_messages_count: number;
}): boolean {
  return conv.user_messages_count >= 1 && conv.messages_count >= 2;
}

export function displayChatId(id: string): string {
  return `chat_${id}`;
}

export function channelLabel(channel: string): string {
  if (channel === "web_test") return "Prueba web";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "web_widget") return "Mi Link";
  if (channel === "web_embed") return "Widget web";
  if (channel === "voice_test") return "Voz prueba";
  return channel;
}

export function inboxChannelBadge(channel: string): string {
  if (channel === "web_widget") return "Mi Link";
  if (channel === "web_embed") return "Widget";
  if (channel === "web_test") return "API";
  if (channel === "voice_test") return "Voz";
  return "API";
}

export function buildChatFallbackSummary(messages: TextChatMessage[]): string {
  if (!messages.length) return "Conversación sin mensajes.";
  const joined = messages
    .map(m => {
      const who = m.role === "user" ? "Usuario" : m.role === "human" ? "Asesor" : "Agente";
      return `${who}: ${m.content}`;
    })
    .join(" ");
  if (joined.length <= 320) return joined;
  return `${joined.slice(0, 317)}...`;
}

export function downloadChatJson(data: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function hasExtractedData(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    return String(v ?? "").trim().length > 0;
  });
}

export function needsChatAnalysis(
  conv: { summary?: string; extracted_data?: Record<string, unknown>; metadata?: Record<string, unknown> },
  messages: TextChatMessage[]
): boolean {
  if (messages.length < 2) return false;
  if (conv.metadata?.analyzed_at) return false;
  if (hasExtractedData(conv.extracted_data)) return false;
  const summary = String(conv.summary ?? "").trim();
  if (!summary) return true;
  return summary === buildChatFallbackSummary(messages);
}

export function normalizeChatMessages(raw: unknown): TextChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const row = item as Record<string, unknown>;
      const role =
        row.role === "assistant" ? "assistant"
        : row.role === "human" ? "human"
        : "user";
      const content = String(row.content ?? "").trim();
      const hasMedia = Boolean(row.media_storage_path);
      if (!content && !hasMedia) return null;
      const mediaType = row.media_type;
      const mediaLabel = row.media_label;
      const internalContent = row.internal_content;
      const mediaStoragePath = row.media_storage_path;
      const mediaMime = row.media_mime;
      return {
        role,
        content,
        created_at: String(row.created_at ?? new Date().toISOString()),
        ...(internalContent ? { internal_content: String(internalContent) } : {}),
        ...(mediaType === "audio" ||
        mediaType === "image" ||
        mediaType === "document" ||
        mediaType === "video" ||
        mediaType === "text"
          ? { media_type: mediaType }
          : {}),
        ...(mediaLabel ? { media_label: String(mediaLabel) } : {}),
        ...(mediaStoragePath ? { media_storage_path: String(mediaStoragePath) } : {}),
        ...(mediaMime ? { media_mime: String(mediaMime) } : {})
      } satisfies TextChatMessage;
    })
    .filter((m): m is TextChatMessage => m !== null);
}
