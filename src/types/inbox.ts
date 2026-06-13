import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export type InboxKind = "text" | "voice";
export type InboxFilter = "all" | "mine" | "unassigned";

export interface InboxListItem {
  id: string;
  kind: InboxKind;
  contact_label: string;
  display_title: string;
  preview: string;
  channel: string;
  channel_label: string;
  agent_id: string;
  agent_name: string;
  status: string;
  assigned_to: string | null;
  handoff_mode: "ai" | "human";
  unread_count: number;
  messages_count: number;
  created_at: string;
  updated_at: string;
}

export interface InboxTextDetail {
  kind: "text";
  id: string;
  contact_label: string;
  display_title: string;
  channel: string;
  channel_label: string;
  agent_id: string;
  agent_name: string;
  assigned_to: string | null;
  handoff_mode: "ai" | "human";
  unread_count: number;
  status: string;
  messages: TextChatMessage[];
  created_at: string;
  updated_at: string;
  /** WhatsApp: ventana Meta 24 h abierta */
  whatsapp_session_open?: boolean;
  whatsapp_session_expires_at?: string | null;
  whatsapp_opted_out?: boolean;
  whatsapp_compliance_notice?: string | null;
}

export interface InboxVoiceDetail {
  kind: "voice";
  id: string;
  contact_label: string;
  channel: string;
  channel_label: string;
  agent_id: string;
  agent_name: string;
  transcript: TranscriptEntry[];
  summary: string;
  duration_sec: number;
  audio_url: string | null;
  created_at: string;
}

export type InboxDetail = InboxTextDetail | InboxVoiceDetail;
