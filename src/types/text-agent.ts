import type { NotifyTeamRules } from "@/lib/text-notify-rules";
import type { SchedulingRules } from "@/lib/scheduling/rules";

export type TextSourceTemplateId =
  | "customer-assistant"
  | "lead-qualification"
  | "sales-inquiries"
  | "website-qa"
  | "meeting-scheduling"
  | "support-follow-up";

export interface TextAgentStats {
  conversations_count: number;
  messages_count: number;
  goals_achieved: number;
  cost_usd: number;
  quality_label: string;
}

export interface TextAgentFormData {
  source_template: TextSourceTemplateId | string;
  name: string;
  prompt: string;
  company_context_id?: string | null;
  data_table_id?: string | null;
  temperature: number;
  llm_model: string;
  max_output_tokens: number;
  /** "Thinking" de Gemini — apagado por defecto, solo para agentes que leen tablas de datos grandes con cuidado. */
  color?: string | null;
  notify_rules?: NotifyTeamRules;
  scheduling_rules?: SchedulingRules;
  /** Si es true, el agente no responde con IA: los chats quedan en cola humana. */
  human_only?: boolean;
}

export interface TextAgentRecord extends TextAgentFormData, TextAgentStats {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TextAgentListItem {
  id: string;
  source_template: string;
  name: string;
  conversations_count: number;
  messages_count: number;
  goals_achieved: number;
  cost_usd: number;
  quality_label: string;
  updated_at: string;
}
