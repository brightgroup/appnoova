/** IDs de plantillas demo en código (voice-agent-templates.ts). No son filas en BD. */
export type VoiceSourceTemplateId =
  | "lead-qualification"
  | "policy-reminder"
  | "follow-up"
  | "customer-service"
  | "meeting-scheduling";

export interface VoiceAgentStats {
  contacts_count: number;
  contacted_count: number;
  calls_count: number;
  goals_achieved: number;
  cost_usd: number;
  quality_label: string;
}

export type VoiceProvider = "google" | "elevenlabs";

export interface VoiceAgentFormData {
  /** Preset demo del que se precargó este agente (solo referencia). */
  source_template: VoiceSourceTemplateId | string;
  name: string;
  prompt: string;
  /** Marca / contexto de empresa asignado a este agente. */
  company_context_id?: string | null;
  /** google = Gemini Live; elevenlabs = voz premium */
  voice_provider?: VoiceProvider;
  elevenlabs_agent_id?: string | null;
  elevenlabs_voice_id?: string | null;
  voice_name: string;
  model: string;
  voice_speed: number;
  temperature: number;
  volume: number;
  llm_model: string;
  color?: string | null;
}

export interface VoiceAgentRecord extends VoiceAgentFormData, VoiceAgentStats {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentListItem {
  id: string;
  source_template: string;
  name: string;
  contacts_count: number;
  contacted_count: number;
  calls_count: number;
  goals_achieved: number;
  cost_usd: number;
  quality_label: string;
  updated_at: string;
}
