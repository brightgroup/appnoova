import type { DataTableColumn } from "@/types/data-table";

export type VoiceCampaignStatus = "draft" | "active" | "paused" | "completed";

export type CampaignCallStatus =
  | "pending"
  | "calling"
  | "completed"
  | "failed"
  | "retry"
  | "skipped";

export type CampaignTriggerType = "excel_date" | "fixed_datetime" | "on_activate";

export interface CampaignDaySlot {
  enabled: boolean;
  start: string;
  end: string;
}

export interface CampaignScheduleConfig {
  start_date: string;
  end_date: string | null;
  timezone: string;
  day_slots: Record<string, CampaignDaySlot>;
  max_attempts_per_contact: number;
  attempts_per_day: number;
}

export interface CampaignTriggerRule {
  type: CampaignTriggerType;
  column_key?: string | null;
  offset_days?: number;
  fixed_at?: string | null;
}

export interface CampaignCustomFieldMapping {
  label: string;
  column_key: string;
  /** Token usado en el prompt como {{variable_key}}. Si falta, se deriva del label. */
  variable_key?: string;
}

export interface CampaignVariable {
  key: string;
  label: string;
  column_key: string | null;
  builtin?: boolean;
}

export interface CampaignFieldMapping {
  phone_column: string;
  name_column: string;
  call_date_column?: string | null;
  custom_fields: CampaignCustomFieldMapping[];
}

export interface CampaignAudienceTableRecord {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  description: string | null;
  columns: DataTableColumn[];
  row_count: number;
  source_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceCampaignRecord {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  goal: string | null;
  voice_agent_id: string | null;
  audience_table_id: string | null;
  status: VoiceCampaignStatus;
  wizard_step: number;
  schedule_config: CampaignScheduleConfig;
  trigger_rule: CampaignTriggerRule;
  field_mapping: CampaignFieldMapping;
  /** Prompt propio de la campaña con variables {{...}}. Si es null, usa el prompt del agente. */
  prompt_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignAudiencePreview {
  suggested_name: string;
  sheet_name: string;
  columns: DataTableColumn[];
  row_count: number;
  sample_rows: Record<string, string | number | boolean | null>[];
}

export interface CampaignAutoMapResult {
  phone_column: string | null;
  name_column: string | null;
  call_date_column: string | null;
  custom_fields: CampaignCustomFieldMapping[];
  confidence: "high" | "medium" | "low";
}

export interface CampaignAudienceRowRecord {
  id: string;
  data: Record<string, string | number | boolean | null>;
  phone_e164: string | null;
  contact_name: string | null;
  scheduled_call_at: string | null;
  call_status: CampaignCallStatus;
  total_attempts: number;
  last_attempt_at: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CampaignAudienceStats {
  total_contacts: number;
  called: number;
  completed: number;
  failed: number;
  pending: number;
  connection_rate: number;
  success_rate: number;
}

export const CAMPAIGN_CALL_STATUS_LABELS: Record<CampaignCallStatus, string> = {
  pending: "Pendiente",
  calling: "Marcando",
  completed: "Completado",
  failed: "Fallido",
  retry: "Reintento",
  skipped: "Omitido",
};

export const CAMPAIGN_CALL_STATUS_COLORS: Record<CampaignCallStatus, string> = {
  pending: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  calling: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  retry: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  skipped: "bg-white/10 text-gray-400 border-white/10",
};

export type CampaignDetailTab =
  | "general"
  | "guion"
  | "audiencia"
  | "programacion"
  | "conexiones"
  | "registro"
  | "metricas";

/** Pestañas que editan configuración y muestran el botón Guardar. */
export const CAMPAIGN_CONFIG_TABS: CampaignDetailTab[] = [
  "general",
  "guion",
  "audiencia",
  "programacion",
];

export const CAMPAIGN_WIZARD_STEPS = [
  { id: 1, label: "Crear campaña", short: "Campaña" },
  { id: 2, label: "Programación", short: "Programación" },
  { id: 3, label: "Audiencia y mapeo", short: "Audiencia" },
] as const;

export const CAMPAIGN_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const CAMPAIGN_DAY_LABELS: Record<(typeof CAMPAIGN_DAY_KEYS)[number], string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};
