import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export type InboxKind = "text" | "voice";
export type InboxFilter = "all" | "mine" | "unassigned";

export interface InboxListItem {
  id: string;
  kind: InboxKind;
  contact_label: string;
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
