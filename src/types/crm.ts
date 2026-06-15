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

export type TipoContacto = "persona" | "empresa";
export type TipoRelacion = "prospecto" | "cliente" | "referido" | "inactivo";
export type CanalPreferido = "whatsapp" | "telefono" | "email";
export type EstadoCanal = "valido" | "invalido" | "rebotado";
export type VentanaWaEstado = "abierta" | "requiere_plantilla" | "sin_conversacion";
export type CrmSuppression = "no_whatsapp" | "no_llamadas" | "no_email";
export type CrmFieldOrigin =
  | "manual"
  | "ia_conversacion"
  | "documento"
  | "importacion"
  | "integracion"
  | "whatsapp";
export type CrmFieldConfidence = "alta" | "media" | "baja";

export interface CrmFieldProvenanceEntry {
  origen: CrmFieldOrigin;
  confianza?: CrmFieldConfidence | null;
  verificado: boolean;
  actualizado_por?: string | null;
  actualizado_en?: string | null;
}

export type CrmFieldProvenance = Record<string, CrmFieldProvenanceEntry>;

export type CrmTenantLabelKey = "producto_servicio" | "categoria_interes" | "asesor_asignado";
export type CrmTenantLabels = Record<CrmTenantLabelKey, string>;

export interface CrmContactActions {
  whatsapp: {
    allowed: boolean;
    mode: "session" | "template" | null;
    reason: string | null;
  };
  call: {
    allowed: boolean;
    reason: string | null;
  };
  can_create_lead: boolean;
  can_open_inbox: boolean;
}

export interface CrmContact {
  id: string;
  user_id: string;
  name: string;
  tipo_contacto: TipoContacto;
  documento_id: string | null;
  organizacion: string | null;
  whatsapp: string | null;
  telefono: string | null;
  email: string | null;
  canal_preferido: CanalPreferido | null;
  estado_whatsapp: EstadoCanal | null;
  estado_email: EstadoCanal | null;
  ultimo_inbound_wa: string | null;
  ventana_wa_estado: VentanaWaEstado;
  supresiones: CrmSuppression[];
  autorizacion_datos: boolean;
  autorizacion_datos_fecha: string | null;
  autorizacion_datos_fuente: string | null;
  fuente_origen: string | null;
  categorias_interes: string[];
  ciudad: string | null;
  tipo_relacion: TipoRelacion;
  asesor_asignado: string | null;
  inbox_conversation_id: string | null;
  field_provenance: CrmFieldProvenance;
  /** Legacy — sincronizado con telefono */
  phone: string | null;
  company: string | null;
  job_title: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
  actions?: CrmContactActions;
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

export type CrmContactFilter =
  | "all"
  | "with_whatsapp"
  | "with_phone"
  | "with_email"
  | "recent"
  | "prospecto"
  | "cliente";

export type CrmLeadFilter = "all" | "open" | "won" | "lost";

export type CrmTimelineEventKind =
  | "message_in"
  | "message_out"
  | "call"
  | "lead"
  | "contact_created"
  | "conversation_lapse";

export interface CrmTimelineEvent {
  id: string;
  kind: CrmTimelineEventKind;
  at: string;
  title: string;
  body?: string;
  channel?: string;
}

export interface CrmContactDuplicateGroup {
  key: string;
  field: "whatsapp" | "email" | "documento_id";
  value: string;
  contacts: Pick<CrmContact, "id" | "name" | "whatsapp" | "email" | "updated_at">[];
}

export interface CrmContactNextStep {
  message: string;
  action?: "inbox" | "lead" | "template" | "edit";
  href?: string;
}
