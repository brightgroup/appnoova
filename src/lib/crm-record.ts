import {
  computeContactActions,
  computeVentanaWaEstado,
  parseSupresiones
} from "@/lib/crm-contactability";
import { enrichCrmLead, scoreToTemperatura } from "@/lib/crm-lead-utils";
import type {
  CrmContact,
  CrmContactActions,
  CrmFieldProvenance,
  CrmFieldProvenanceEntry,
  CrmLead,
  CrmLeadOutcome,
  CrmLeadTemperatura,
  CrmMotivoPerdida,
  CrmPipelineStage,
  CrmPropertyDefinition,
  CrmPropertyFieldType
} from "@/types/crm";

export const DEFAULT_CRM_STAGES: Omit<CrmPipelineStage, "id" | "user_id" | "created_at" | "updated_at">[] = [
  {
    name: "Nuevo",
    slug: "nuevo",
    color: "#5b5bf6",
    sort_order: 0,
    is_won: false,
    is_lost: false,
    ai_enter_criteria:
      "Lead recién creado o primer mensaje del prospecto sin respuesta del asesor o IA."
  },
  {
    name: "Contactado",
    slug: "contactado",
    color: "#8b5cf6",
    sort_order: 1,
    is_won: false,
    is_lost: false,
    ai_enter_criteria:
      "Hay diálogo activo: el asesor o la IA ya respondió y la conversación continúa."
  },
  {
    name: "Cotizado",
    slug: "cotizado",
    color: "#f59e0b",
    sort_order: 2,
    is_won: false,
    is_lost: false,
    ai_enter_criteria:
      "El cliente pidió cotización, precio o tarifa; o se envió o discutió una propuesta formal."
  },
  {
    name: "Negociación",
    slug: "negociacion",
    color: "#3b82f6",
    sort_order: 3,
    is_won: false,
    is_lost: false,
    ai_enter_criteria:
      "Objeciones, comparación con competencia, negociación de condiciones o cierre pendiente."
  }
];

/** Etapas activas del pipeline (excluye legacy ganado/perdido). */
export function filterPipelineStages(stages: CrmPipelineStage[]): CrmPipelineStage[] {
  return stages.filter(s => !s.is_won && !s.is_lost);
}

export const CRM_LEAD_OUTCOME_LABELS: Record<CrmLeadOutcome, string> = {
  open: "Abierto",
  won: "Ganado",
  lost: "Perdido"
};

export const CONTACT_BUILTIN_FIELDS: {
  key: keyof Pick<CrmContact, "name" | "email" | "notes">;
  label: string;
  field_type: CrmPropertyFieldType;
  required?: boolean;
  group_name: string;
}[] = [
  { key: "name", label: "Nombre", field_type: "text", required: true, group_name: "Identidad" },
  { key: "email", label: "Email", field_type: "email", group_name: "Canales" },
  { key: "notes", label: "Notas", field_type: "textarea", group_name: "Notas" }
];

function parseFieldProvenance(raw: unknown): CrmFieldProvenance {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CrmFieldProvenance = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const e = v as Record<string, unknown>;
    out[k] = {
      origen: (["manual", "ia_conversacion", "documento", "importacion", "integracion", "whatsapp"].includes(String(e.origen))
        ? String(e.origen) : "manual") as CrmFieldProvenanceEntry["origen"],
      confianza: e.confianza ? String(e.confianza) as CrmFieldProvenanceEntry["confianza"] : null,
      verificado: Boolean(e.verificado),
      actualizado_por: e.actualizado_por ? String(e.actualizado_por) : null,
      actualizado_en: e.actualizado_en ? String(e.actualizado_en) : null
    };
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => String(v).trim()).filter(Boolean);
}

function parseEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "") as T;
  return allowed.includes(v) ? v : fallback;
}

export function enrichCrmContact(contact: CrmContact): CrmContact {
  const actions: CrmContactActions = computeContactActions(contact);
  return { ...contact, actions };
}

export const DEFAULT_CONTACT_PROPERTIES: Omit<
  CrmPropertyDefinition,
  "id" | "user_id" | "created_at" | "updated_at"
>[] = [
  {
    entity_type: "contact",
    field_key: "prioridad",
    label: "Prioridad",
    field_type: "select",
    options: ["Alta", "Media", "Baja"],
    is_builtin: true,
    is_required: false,
    sort_order: 0,
    group_name: "Contexto"
  },
  {
    entity_type: "contact",
    field_key: "tipo_cliente",
    label: "Tipo de cliente",
    field_type: "select",
    options: ["Prospecto", "Cliente", "Partner"],
    is_builtin: true,
    is_required: false,
    sort_order: 1,
    group_name: "Contexto"
  }
];

export const DEFAULT_LEAD_PROPERTIES: Omit<
  CrmPropertyDefinition,
  "id" | "user_id" | "created_at" | "updated_at"
>[] = [];

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => String(v).trim()).filter(Boolean);
}

function parseMetadata(raw: unknown): Record<string, string | number | boolean | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

function parseOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => String(v).trim()).filter(Boolean);
}

export function slugifyPropertyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function toCrmPropertyDefinition(raw: Record<string, unknown>): CrmPropertyDefinition {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    entity_type: raw.entity_type === "lead" ? "lead" : "contact",
    field_key: String(raw.field_key),
    label: String(raw.label),
    field_type: (String(raw.field_type ?? "text") as CrmPropertyFieldType),
    options: parseOptions(raw.options),
    is_builtin: Boolean(raw.is_builtin),
    is_required: Boolean(raw.is_required),
    sort_order: Number(raw.sort_order ?? 0),
    group_name: String(raw.group_name ?? "Personalizado"),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

export function toCrmStage(raw: Record<string, unknown>): CrmPipelineStage {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    name: String(raw.name),
    slug: String(raw.slug),
    color: String(raw.color ?? "#5b5bf6"),
    sort_order: Number(raw.sort_order ?? 0),
    is_won: Boolean(raw.is_won),
    is_lost: Boolean(raw.is_lost),
    ai_enter_criteria: raw.ai_enter_criteria ? String(raw.ai_enter_criteria) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

export function toCrmContact(raw: Record<string, unknown>): CrmContact {
  const ultimoInboundWa = raw.ultimo_inbound_wa ? String(raw.ultimo_inbound_wa) : null;
  const telefono = raw.telefono ? String(raw.telefono) : raw.phone ? String(raw.phone) : null;
  const base: CrmContact = {
    id: String(raw.id),
    user_id: String(raw.user_id),
    name: String(raw.name),
    tipo_contacto: parseEnum(raw.tipo_contacto, ["persona", "empresa"] as const, "persona"),
    documento_id: raw.documento_id ? String(raw.documento_id) : null,
    organizacion: raw.organizacion ? String(raw.organizacion) : raw.company ? String(raw.company) : null,
    whatsapp: raw.whatsapp ? String(raw.whatsapp) : null,
    telefono,
    email: raw.email ? String(raw.email) : null,
    canal_preferido: raw.canal_preferido
      ? parseEnum(raw.canal_preferido, ["whatsapp", "telefono", "email"] as const, "whatsapp")
      : null,
    estado_whatsapp: raw.estado_whatsapp
      ? parseEnum(raw.estado_whatsapp, ["valido", "invalido", "rebotado"] as const, "valido")
      : null,
    estado_email: raw.estado_email
      ? parseEnum(raw.estado_email, ["valido", "invalido", "rebotado"] as const, "valido")
      : null,
    ultimo_inbound_wa: ultimoInboundWa,
    ventana_wa_estado: computeVentanaWaEstado(ultimoInboundWa),
    supresiones: parseSupresiones(raw.supresiones),
    autorizacion_datos: Boolean(raw.autorizacion_datos),
    autorizacion_datos_fecha: raw.autorizacion_datos_fecha ? String(raw.autorizacion_datos_fecha) : null,
    autorizacion_datos_fuente: raw.autorizacion_datos_fuente ? String(raw.autorizacion_datos_fuente) : null,
    fuente_origen: raw.fuente_origen ? String(raw.fuente_origen) : raw.source ? String(raw.source) : null,
    categorias_interes: parseStringArray(raw.categorias_interes),
    ciudad: raw.ciudad ? String(raw.ciudad) : null,
    tipo_relacion: parseEnum(
      raw.tipo_relacion,
      ["prospecto", "cliente", "referido", "inactivo"] as const,
      "prospecto"
    ),
    asesor_asignado: raw.asesor_asignado ? String(raw.asesor_asignado) : null,
    inbox_conversation_id: raw.inbox_conversation_id ? String(raw.inbox_conversation_id) : null,
    field_provenance: parseFieldProvenance(raw.field_provenance),
    phone: telefono,
    company: raw.organizacion ? String(raw.organizacion) : raw.company ? String(raw.company) : null,
    job_title: raw.job_title ? String(raw.job_title) : null,
    source: raw.fuente_origen ? String(raw.fuente_origen) : raw.source ? String(raw.source) : null,
    notes: raw.notes ? String(raw.notes) : null,
    tags: parseTags(raw.tags),
    metadata: parseMetadata(raw.metadata),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
  return enrichCrmContact(base);
}

function parseMotivoPerdida(raw: unknown): CrmMotivoPerdida | null {
  const allowed = [
    "precio",
    "no_respondio",
    "compro_otro",
    "no_era_momento",
    "sin_presupuesto",
    "datos_incompletos",
    "otro"
  ] as const;
  const v = String(raw ?? "");
  return allowed.includes(v as CrmMotivoPerdida) ? (v as CrmMotivoPerdida) : null;
}

function parseTemperatura(raw: unknown): CrmLeadTemperatura | null {
  const allowed = ["frio", "tibio", "caliente"] as const;
  const v = String(raw ?? "");
  return allowed.includes(v as CrmLeadTemperatura) ? (v as CrmLeadTemperatura) : null;
}

export function toCrmLead(raw: Record<string, unknown>): CrmLead {
  const contactRaw = raw.contact as Record<string, unknown> | null | undefined;
  const stageRaw = raw.stage as Record<string, unknown> | null | undefined;
  const score = raw.score != null ? Number(raw.score) : null;
  const base: CrmLead = {
    id: String(raw.id),
    user_id: String(raw.user_id),
    contact_id: String(raw.contact_id),
    stage_id: String(raw.stage_id),
    title: String(raw.title),
    value_amount: raw.value_amount != null ? Number(raw.value_amount) : null,
    currency: String(raw.currency ?? "COP"),
    source: raw.source ? String(raw.source) : null,
    notes: raw.notes ? String(raw.notes) : null,
    sort_order: Number(raw.sort_order ?? 0),
    outcome: raw.outcome === "won" || raw.outcome === "lost" ? raw.outcome : "open",
    motivo_perdida: parseMotivoPerdida(raw.motivo_perdida),
    motivo_perdida_detalle: raw.motivo_perdida_detalle ? String(raw.motivo_perdida_detalle) : null,
    asesor_responsable: raw.asesor_responsable ? String(raw.asesor_responsable) : null,
    categoria_interes: raw.categoria_interes ? String(raw.categoria_interes) : null,
    producto_interes: raw.producto_interes ? String(raw.producto_interes) : null,
    score: score != null && !Number.isNaN(score) ? score : null,
    temperatura: parseTemperatura(raw.temperatura) ?? scoreToTemperatura(score),
    stage_entered_at: String(raw.stage_entered_at ?? raw.created_at ?? ""),
    fecha_ultima_interaccion: raw.fecha_ultima_interaccion
      ? String(raw.fecha_ultima_interaccion)
      : null,
    field_provenance: parseFieldProvenance(raw.field_provenance),
    inbox_conversation_id: raw.inbox_conversation_id ? String(raw.inbox_conversation_id) : null,
    metadata: parseMetadata(raw.metadata),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    contact: contactRaw ? toCrmContact(contactRaw) : null,
    stage: stageRaw ? toCrmStage(stageRaw) : null
  };
  return enrichCrmLead(base);
}

export function slugifyStageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function formatLeadValue(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
