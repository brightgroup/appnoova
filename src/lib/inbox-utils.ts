import { channelLabel, inboxChannelBadge, normalizeChatMessages } from "@/lib/text-chat-utils";
import type { InboxListItem } from "@/types/inbox";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export function makeVisitorLabel(): string {
  return `anonymous-${(Date.now() / 1000).toFixed(6)}`;
}

/** Título legible para la bandeja (evita mostrar anonymous-... crudo). */
export function formatInboxDisplayTitle(
  contactLabel: string,
  channel: string,
  conversationId: string
): string {
  const shortId = conversationId.replace(/-/g, "").slice(0, 6).toUpperCase();

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
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
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
      String(row.id)
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
  return [...items].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
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
