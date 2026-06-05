/** IDs de plantillas demo en código (voice-agent-templates.ts). No son filas en BD. */
export type VoiceSourceTemplateId =
  | "lead-qualification"
  | "policy-reminder"
  | "follow-up";

export interface VoiceAgentStats {
  contacts_count: number;
  contacted_count: number;
  calls_count: number;
  goals_achieved: number;
  cost_usd: number;
  quality_label: string;
}

export interface VoiceAgentFormData {
  /** Preset demo del que se precargó este agente (solo referencia). */
  source_template: VoiceSourceTemplateId | string;
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
