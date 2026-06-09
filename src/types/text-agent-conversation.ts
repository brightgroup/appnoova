export interface TextChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
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
}
