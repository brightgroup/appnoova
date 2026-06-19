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
  color?: string | null;
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
