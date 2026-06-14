export interface CrmPipelineStage {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
}

export type CrmPropertyEntity = "contact" | "lead";

export type CrmPropertyFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "phone"
  | "email"
  | "url"
  | "boolean"
  | "textarea";

export interface CrmPropertyDefinition {
  id: string;
  user_id: string;
  entity_type: CrmPropertyEntity;
  field_key: string;
  label: string;
  field_type: CrmPropertyFieldType;
  options: string[];
  is_builtin: boolean;
  is_required: boolean;
  sort_order: number;
  group_name: string;
  created_at: string;
  updated_at: string;
}

/** Campos estándar del contacto (columnas en BD, no metadata). */
export interface CrmContactBuiltinField {
  key: keyof Pick<CrmContact, "name" | "email" | "phone" | "company" | "job_title" | "source" | "notes">;
  label: string;
  field_type: CrmPropertyFieldType;
  required?: boolean;
  group_name: string;
}

export interface CrmContact {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
}

export type CrmLeadOutcome = "open" | "won" | "lost";

export interface CrmLead {
  id: string;
  user_id: string;
  contact_id: string | null;
  stage_id: string;
  outcome: CrmLeadOutcome;
  title: string;
  value_amount: number | null;
  currency: string;
  source: string | null;
  notes: string | null;
  sort_order: number;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
  contact?: CrmContact | null;
  stage?: CrmPipelineStage | null;
}

export type CrmLeadsView = "kanban" | "list";

export type CrmContactFilter = "all" | "with_phone" | "with_email" | "recent";

export type CrmLeadFilter = "all" | "open" | "won" | "lost";
