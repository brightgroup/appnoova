export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  time_sec: number;
}

export interface VoiceAgentCallRecord {
  id: string;
  user_id: string;
  voice_agent_id: string;
  phone_number: string;
  duration_sec: number;
  credits: number;
  status: string;
  status_label: string;
  in_voicemail: boolean;
  disconnect_reason: string;
  user_sentiment: string;
  summary: string;
  extracted_data: Record<string, unknown>;
  dynamic_variables: Record<string, unknown>;
  transcript: TranscriptEntry[];
  audio_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VoiceAgentCallListItem {
  id: string;
  voice_agent_id: string;
  phone_number: string;
  duration_sec: number;
  credits: number;
  status?: string;
  status_label: string;
  in_voicemail: boolean;
  disconnect_reason: string;
  user_sentiment: string;
  summary: string;
  audio_url: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}
