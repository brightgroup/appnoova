import type { DataTableColumn } from "@/types/data-table";

export type VoiceCampaignStatus = "draft" | "active" | "paused" | "completed";

export type CampaignCallStatus =
  | "pending"
  | "calling"
  | "retry"
  | "connected"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "rejected"
  | "failed"
  | "invalid"
  | "skipped";

/** Tipo de campaña — define el comportamiento CRM por defecto. */
export type CampaignType = "prospeccion" | "seguimiento" | "encuesta" | "notificacion";

export type CampaignOutputFieldType =
  | "select"
  | "text"
  | "boolean"
  | "date"
  | "time"
  | "number";

/** Regla de escritura al vincular un campo de campaña con la ficha del contacto. */
export type CampaignContactLinkMode = "overwrite" | "fill_empty";

export interface CampaignOutputFieldContactLink {
  /** Campo destino en la ficha: builtin (name, email, ciudad…) o "metadata.<field_key>" */
  contact_field: string;
  mode: CampaignContactLinkMode;
}

/** Campo de salida personalizable que la IA llena tras cada llamada. */
export interface CampaignOutputField {
  key: string;
  label: string;
  field_type: CampaignOutputFieldType;
  options: string[];
  /** Instrucción literal que usa la IA para capturar el dato. */
  ai_instruction: string;
  required: boolean;
  /** Tipificación principal — veredicto de la llamada. Solo una por campaña (tipo select). */
  is_primary: boolean;
  contact_link?: CampaignOutputFieldContactLink | null;
}

/** Configuración CRM por campaña (defaults según campaign_type, ajustables). */
export interface CampaignCrmConfig {
  /** Cuándo crear lead + oportunidad: al detectar interés, al importar, o nunca. */
  create_leads: "on_interest" | "on_import" | "never";
  /** Valores de la tipificación principal que significan "interés". */
  interest_values: string[];
  /** Etapa del pipeline para leads creados (null → primera etapa). */
  pipeline_stage_id: string | null;
}

/** Política para contactos que ya existen en el CRM al importar audiencia. */
export type CampaignImportPolicy = "skip" | "fill_empty" | "overwrite";

/** Mapeo columna del Excel → campo de la ficha del contacto. */
export interface CampaignContactColumnMapping {
  column_key: string;
  /** builtin: name, email, ciudad, organizacion, documento_id — o "metadata.<key>" */
  contact_field: string;
}

export interface CampaignImportSummary {
  total_rows: number;
  duplicates_in_file: number;
  invalid_phone: number;
  existing_contacts: number;
  new_contacts: number;
  suppressed: number;
  rejected_rows: { row_index: number; phone_raw: string; reason: string }[];
}

export interface CampaignImportResult {
  created_contacts: number;
  linked_contacts: number;
  enrolled: number;
  rejected: number;
  suppressed: number;
  leads_created: number;
  rejected_rows: { row_index: number; phone_raw: string; reason: string }[];
}

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
  /** Columnas del archivo que alimentan la ficha del contacto (email, ciudad, etc.). */
  contact_fields?: CampaignContactColumnMapping[];
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
  campaign_type: CampaignType;
  output_fields: CampaignOutputField[];
  crm_config: CampaignCrmConfig;
  schedule_config: CampaignScheduleConfig;
  trigger_rule: CampaignTriggerRule;
  field_mapping: CampaignFieldMapping;
  /** Prompt propio de la campaña con variables {{...}}. Si es null, usa el prompt del agente. */
  prompt_template: string | null;
  completed_at: string | null;
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
  crm_contact_id?: string | null;
  crm_lead_id?: string | null;
  /** Última captura de la IA por campo de salida ({ [field_key]: valor }). */
  results?: Record<string, string | number | boolean | null>;
  /** Metadatos de captura ({ [field_key]: { pending_review, raw } }). */
  results_meta?: Record<string, { pending_review?: boolean; raw?: string } | undefined>;
  /** Valor de la tipificación principal. */
  result_primary?: string | null;
  excluded_reason?: string | null;
}

export interface CampaignAudienceStats {
  total_contacts: number;
  called: number;
  connected: number;
  voicemail: number;
  no_answer: number;
  busy: number;
  rejected: number;
  failed: number;
  pending: number;
  connection_rate: number;
}

export const CAMPAIGN_CALL_STATUS_LABELS: Record<CampaignCallStatus, string> = {
  pending: "Pendiente",
  calling: "Marcando",
  retry: "Reintento",
  connected: "Conectado",
  voicemail: "Buzón de voz",
  no_answer: "No contactable",
  busy: "Ocupado",
  rejected: "Rechazada",
  failed: "Error técnico",
  invalid: "Número inválido",
  skipped: "Excluido",
};

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  prospeccion: "Prospección en frío",
  seguimiento: "Seguimiento comercial",
  encuesta: "Encuesta",
  notificacion: "Notificación / transaccional",
};

export const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  prospeccion:
    "Los contactos entran como contactos normales. Se crea lead y oportunidad solo cuando la IA detecta interés.",
  seguimiento:
    "La lista viene de gente que ya mostró interés. Al importar, cada persona queda como lead con su oportunidad en el embudo.",
  encuesta: "Solo captura respuestas. Nunca crea leads ni oportunidades.",
  notificacion: "Recordatorios o avisos. Nunca crea leads ni oportunidades.",
};

export const CAMPAIGN_OUTPUT_FIELD_TYPE_LABELS: Record<CampaignOutputFieldType, string> = {
  select: "Lista desplegable",
  text: "Texto libre",
  boolean: "Sí / No",
  date: "Fecha",
  time: "Hora",
  number: "Número",
};

export const CAMPAIGN_CALL_STATUS_COLORS: Record<CampaignCallStatus, string> = {
  pending: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  calling: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  retry: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  connected: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  voicemail: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  no_answer: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  busy: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  rejected: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  invalid: "bg-red-500/20 text-red-300 border-red-500/30",
  skipped: "bg-white/10 text-gray-400 border-white/10",
};

export type CampaignDetailTab =
  | "general"
  | "guion"
  | "campos"
  | "audiencia"
  | "resultados"
  | "programacion"
  | "conexiones"
  | "registro"
  | "metricas";

/** Pestañas que editan configuración y muestran el botón Guardar. */
export const CAMPAIGN_CONFIG_TABS: CampaignDetailTab[] = [
  "general",
  "guion",
  "campos",
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
