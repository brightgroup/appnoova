import { channelLabel, inboxChannelBadge, normalizeChatMessages } from "@/lib/text-chat-utils";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import type { InboxListItem, InboxTextDetail } from "@/types/inbox";
import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export function makeVisitorLabel(): string {
  return `anonymous-${(Date.now() / 1000).toFixed(6)}`;
}

function looksLikePhone(value: string): boolean {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+?\d{10,15}$/.test(compact);
}

/** Título legible para la bandeja (evita mostrar anonymous-... crudo). */
export function formatInboxDisplayTitle(
  contactLabel: string,
  channel: string,
  conversationId: string,
  metadata?: Record<string, unknown>
): string {
  const shortId = conversationId.replace(/-/g, "").slice(0, 6).toUpperCase();

  if (channel === WHATSAPP_CONVERSATION_CHANNEL) {
    const e164 = metadata?.whatsapp_contact_e164
      ? String(metadata.whatsapp_contact_e164).trim()
      : null;
    const label = contactLabel.trim();

    if (label.includes(" · ")) return label;

    if (label && e164 && label !== e164 && !looksLikePhone(label)) {
      return `${label} · ${e164}`;
    }

    return e164 || label || "WhatsApp";
  }

  if (channel === "web_widget") {
    if (contactLabel.startsWith("anonymous-")) {
      const suffix = contactLabel.replace("anonymous-", "").replace(".", "").slice(-6);
      return `Visitante Mi Link #${suffix || shortId}`;
    }
    return `Visitante Mi Link #${shortId}`;
  }

  if (channel === "web_embed") {
    if (contactLabel.startsWith("anonymous-")) {
      const suffix = contactLabel.replace("anonymous-", "").replace(".", "").slice(-6);
      return `Visitante widget #${suffix || shortId}`;
    }
    return `Visitante widget #${shortId}`;
  }

  if (channel === "web_test") {
    return `Prueba de agente #${shortId}`;
  }

  const base = contactLabel.trim() || "Conversación";
  if (base.toLowerCase() === "prueba web") {
    return `Prueba de agente #${shortId}`;
  }

  return `${base} #${shortId}`;
}

export function formatInboxTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (sameDay) {
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

export function formatInboxMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function lastTextPreview(messages: unknown): string {
  const list = normalizeChatMessages(messages);
  const last = [...list].reverse().find(m => m.role === "user" || m.role === "assistant" || m.role === "human");
  if (!last) return "Sin mensajes";
  const text = last.content.replace(/\s+/g, " ").trim();
  if (text) return text.length > 72 ? `${text.slice(0, 69)}...` : text;
  if (last.media_type === "image") return "Imagen";
  if (last.media_type === "audio") return "Nota de voz";
  if (last.media_type === "video") return "Video";
  if (last.media_type === "document") return "Documento";
  return "Archivo";
}

function lastVoicePreview(transcript: unknown): string {
  if (!Array.isArray(transcript) || transcript.length === 0) return "Llamada sin transcripción";
  const last = transcript[transcript.length - 1] as TranscriptEntry;
  const text = String(last.text ?? "").replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 69)}...` : text || "Llamada de voz";
}

export function textRowToInboxItem(
  row: Record<string, unknown>,
  agentName: string
): InboxListItem {
  const channel = String(row.channel ?? "web_test");
  const updatedAt = String(row.updated_at ?? row.created_at ?? "");
  return {
    id: String(row.id),
    kind: "text",
    contact_label: String(row.contact_label ?? "Visitante"),
    display_title: formatInboxDisplayTitle(
      String(row.contact_label ?? "Visitante"),
      channel,
      String(row.id),
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : undefined
    ),
    preview: lastTextPreview(row.messages) || String(row.summary ?? "Sin mensajes"),
    channel,
    channel_label: inboxChannelBadge(channel),
    agent_id: String(row.text_agent_id),
    agent_name: agentName,
    status: String(row.status ?? "active"),
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    handoff_mode: row.handoff_mode === "human" ? "human" : "ai",
    unread_count: Number(row.unread_count) || 0,
    messages_count: Number(row.messages_count) || 0,
    created_at: String(row.created_at ?? ""),
    updated_at: updatedAt
  };
}

export function voiceRowToInboxItem(
  row: Record<string, unknown>,
  agentName: string
): InboxListItem {
  const createdAt = String(row.created_at ?? "");
  return {
    id: String(row.id),
    kind: "voice",
    contact_label: String(row.phone_number ?? "Prueba web"),
    display_title: formatInboxDisplayTitle(
      String(row.phone_number ?? "Prueba web"),
      "voice_test",
      String(row.id)
    ),
    preview: lastVoicePreview(row.transcript) || String(row.summary ?? "Llamada de voz"),
    channel: "voice_test",
    channel_label: inboxChannelBadge("voice_test"),
    agent_id: String(row.voice_agent_id),
    agent_name: agentName,
    status: String(row.status ?? "ended_success"),
    assigned_to: null,
    handoff_mode: "ai",
    unread_count: 0,
    messages_count: Array.isArray(row.transcript) ? row.transcript.length : 0,
    created_at: createdAt,
    updated_at: createdAt
  };
}

export function sortInboxItems(items: InboxListItem[]): InboxListItem[] {
  return [...items].sort((a, b) => {
    const aUnread = (a.unread_count ?? 0) > 0 ? 1 : 0;
    const bUnread = (b.unread_count ?? 0) > 0 ? 1 : 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function filterInboxItems(
  items: InboxListItem[],
  filter: "all" | "mine" | "unassigned",
  currentUserName: string
): InboxListItem[] {
  if (filter === "mine") {
    return items.filter(
      i => i.kind === "text" && i.handoff_mode === "human" && i.assigned_to === currentUserName
    );
  }
  if (filter === "unassigned") {
    return items.filter(
      i => i.kind === "text" && i.handoff_mode === "human" && !i.assigned_to
    );
  }
  return items;
}

export function inboxMessageLabel(role: string): string {
  if (role === "user") return "Usuario";
  if (role === "human") return "Asesor";
  return "Asistente";
}

export function inboxDetailChannelLabel(channel: string): string {
  return channelLabel(channel);
}

export function inboxMessageStableKey(message: TextChatMessage): string {
  return [
    message.created_at,
    message.role,
    message.content,
    message.media_type ?? "",
    message.media_storage_path ?? ""
  ].join("\u0001");
}

/** Evita re-render del hilo cuando el poll solo rota URLs firmadas de media. */
export function mergeInboxTextDetail(
  prev: InboxTextDetail,
  next: InboxTextDetail
): InboxTextDetail {
  const prevKeys = prev.messages.map(inboxMessageStableKey);
  const nextKeys = next.messages.map(inboxMessageStableKey);
  const keysMatch =
    prevKeys.length === nextKeys.length &&
    prevKeys.every((key, index) => key === nextKeys[index]);

  if (!keysMatch) return next;

  const metaMatch =
    prev.handoff_mode === next.handoff_mode &&
    prev.assigned_to === next.assigned_to &&
    prev.whatsapp_session_open === next.whatsapp_session_open &&
    prev.whatsapp_opted_out === next.whatsapp_opted_out &&
    prev.whatsapp_compliance_notice === next.whatsapp_compliance_notice &&
    prev.status === next.status &&
    prev.display_title === next.display_title &&
    prev.contact_label === next.contact_label;

  const messages = prev.messages.map((oldMsg, index) => {
    const newMsg = next.messages[index];
    if (
      oldMsg.media_storage_path &&
      oldMsg.media_storage_path === newMsg.media_storage_path &&
      oldMsg.media_url
    ) {
      return oldMsg;
    }
    if (
      oldMsg.media_url === newMsg.media_url &&
      oldMsg.content === newMsg.content &&
      oldMsg.media_type === newMsg.media_type &&
      oldMsg.media_label === newMsg.media_label
    ) {
      return oldMsg;
    }
    return newMsg;
  });

  const messagesUnchanged = messages.every((msg, index) => msg === prev.messages[index]);
  if (messagesUnchanged && metaMatch) return prev;

  return { ...next, messages };
}
