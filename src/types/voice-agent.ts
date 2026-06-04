export interface VoiceAgentRecord {
  id: string;
  user_id: string;
  template_id: string;
  name: string;
  prompt: string;
  voice_name: string;
  model: string;
  voice_speed: number;
  temperature: number;
  volume: number;
  llm_model: string;
  color: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentFormData {
  template_id: string;
  name: string;
  prompt: string;
  voice_name: string;
  model: string;
  voice_speed: number;
  temperature: number;
  volume: number;
  llm_model: string;
  color?: string | null;
}
