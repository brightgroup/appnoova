export interface TextChatMessage {
  role: "user" | "assistant" | "human";
  content: string;
  created_at: string;
  /** Contexto para IA (transcripción, descripción de imagen); no se muestra en Inbox. */
  internal_content?: string;
  media_type?: "text" | "audio" | "image" | "document" | "video";
  media_label?: string;
  /** Ruta en bucket whatsapp-media (persistida). */
  media_storage_path?: string;
  /** URL firmada temporal (solo en respuestas API al cliente). */
  media_url?: string;
  media_mime?: string;
}

export interface TextAgentConversationRecord {
  id: string;
  user_id: string;
  text_agent_id: string;
  channel: string;
  contact_label: string;
  messages_count: number;
  user_messages_count: number;
  duration_sec: number;
  credits: number;
  status: string;
  status_label: string;
  user_sentiment: string;
  summary: string;
  extracted_data: Record<string, unknown>;
  messages: TextChatMessage[];
  llm_model: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  assigned_to: string | null;
  handoff_mode: "ai" | "human";
  unread_count: number;
}

export interface TextAgentConversationListItem {
  id: string;
  text_agent_id: string;
  channel: string;
  contact_label: string;
  messages_count: number;
  user_messages_count: number;
  duration_sec: number;
  credits: number;
  status: string;
  status_label: string;
  user_sentiment: string;
  summary: string;
  llm_model: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  assigned_to: string | null;
  handoff_mode: "ai" | "human";
  unread_count: number;
}
