import type {
  CampaignDaySlot,
  CampaignFieldMapping,
  CampaignScheduleConfig,
  CampaignTriggerRule,
  VoiceCampaignRecord,
  CampaignAudienceTableRecord,
} from "@/types/voice-campaign";
import { CAMPAIGN_DAY_KEYS } from "@/types/voice-campaign";

export function defaultDaySlots(): Record<string, CampaignDaySlot> {
  const slots: Record<string, CampaignDaySlot> = {};
  for (const key of CAMPAIGN_DAY_KEYS) {
    slots[key] = {
      enabled: key !== "sat" && key !== "sun",
      start: "08:00",
      end: "18:00",
    };
  }
  return slots;
}

export function defaultScheduleConfig(): CampaignScheduleConfig {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return {
    start_date: `${y}-${m}-${d}`,
    end_date: null,
    timezone: "America/Bogota",
    day_slots: defaultDaySlots(),
    max_attempts_per_contact: 3,
    attempts_per_day: 1,
  };
}

export function defaultTriggerRule(): CampaignTriggerRule {
  return {
    type: "excel_date",
    column_key: null,
    offset_days: -30,
    fixed_at: null,
  };
}

export function defaultFieldMapping(): CampaignFieldMapping {
  return {
    phone_column: "",
    name_column: "",
    call_date_column: null,
    custom_fields: [],
  };
}

export function toVoiceCampaignRecord(raw: Record<string, unknown>): VoiceCampaignRecord {
  const schedule = (raw.schedule_config ?? {}) as Partial<CampaignScheduleConfig>;
  const trigger = (raw.trigger_rule ?? {}) as Partial<CampaignTriggerRule>;
  const mapping = (raw.field_mapping ?? {}) as Partial<CampaignFieldMapping>;

  return {
    id: String(raw.id),
    organization_id: String(raw.organization_id),
    user_id: String(raw.user_id),
    name: String(raw.name ?? ""),
    goal: raw.goal ? String(raw.goal) : null,
    voice_agent_id: raw.voice_agent_id ? String(raw.voice_agent_id) : null,
    audience_table_id: raw.audience_table_id ? String(raw.audience_table_id) : null,
    status: (raw.status as VoiceCampaignRecord["status"]) ?? "draft",
    wizard_step: Number(raw.wizard_step ?? 1),
    schedule_config: {
      ...defaultScheduleConfig(),
      ...schedule,
      day_slots: {
        ...defaultDaySlots(),
        ...(schedule.day_slots ?? {}),
      },
    },
    trigger_rule: {
      ...defaultTriggerRule(),
      ...trigger,
    },
    field_mapping: {
      ...defaultFieldMapping(),
      ...mapping,
      custom_fields: Array.isArray(mapping.custom_fields) ? mapping.custom_fields : [],
    },
    prompt_template: raw.prompt_template ? String(raw.prompt_template) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export function toAudienceTableRecord(raw: Record<string, unknown>): CampaignAudienceTableRecord {
  return {
    id: String(raw.id),
    organization_id: String(raw.organization_id),
    user_id: String(raw.user_id),
    name: String(raw.name ?? ""),
    description: raw.description ? String(raw.description) : null,
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    row_count: Number(raw.row_count ?? 0),
    source_file_name: raw.source_file_name ? String(raw.source_file_name) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export const CAMPAIGN_STATUS_LABELS: Record<VoiceCampaignRecord["status"], string> = {
  draft: "Borrador",
  active: "Activa",
  paused: "Pausada",
  completed: "Finalizada",
};

export const CAMPAIGN_TIMEZONES = [
  { id: "America/Bogota", label: "Bogotá (COL)" },
  { id: "America/Mexico_City", label: "Ciudad de México" },
  { id: "America/Lima", label: "Lima" },
  { id: "America/Santiago", label: "Santiago" },
  { id: "America/Buenos_Aires", label: "Buenos Aires" },
];
