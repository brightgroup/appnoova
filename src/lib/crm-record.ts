import type {
  CrmContact,
  CrmLead,
  CrmLeadOutcome,
  CrmPipelineStage,
  CrmPropertyDefinition,
  CrmPropertyFieldType
} from "@/types/crm";

export const DEFAULT_CRM_STAGES: Omit<CrmPipelineStage, "id" | "user_id" | "created_at" | "updated_at">[] = [
  { name: "Contacto inicial", slug: "contacto_inicial", color: "#5b5bf6", sort_order: 0, is_won: false, is_lost: false },
  { name: "En seguimiento", slug: "en_seguimiento", color: "#8b5cf6", sort_order: 1, is_won: false, is_lost: false },
  { name: "En cotización", slug: "en_cotizacion", color: "#f59e0b", sort_order: 2, is_won: false, is_lost: false },
  { name: "Negociación", slug: "negociacion", color: "#3b82f6", sort_order: 3, is_won: false, is_lost: false }
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
  key: keyof Pick<CrmContact, "name" | "email" | "phone" | "company" | "job_title" | "source" | "notes">;
  label: string;
  field_type: CrmPropertyFieldType;
  required?: boolean;
  group_name: string;
}[] = [
  { key: "name", label: "Nombre", field_type: "text", required: true, group_name: "Información básica" },
  { key: "phone", label: "Teléfono", field_type: "phone", group_name: "Información básica" },
  { key: "email", label: "Email", field_type: "email", group_name: "Información básica" },
  { key: "company", label: "Empresa", field_type: "text", group_name: "Información básica" },
  { key: "job_title", label: "Cargo", field_type: "text", group_name: "Información básica" },
  { key: "source", label: "Origen", field_type: "text", group_name: "Información básica" },
  { key: "notes", label: "Notas", field_type: "textarea", group_name: "Información básica" }
];

export const DEFAULT_CONTACT_PROPERTIES: Omit<
  CrmPropertyDefinition,
  "id" | "user_id" | "created_at" | "updated_at"
>[] = [
  {
    entity_type: "contact",
    field_key: "ciudad",
    label: "Ciudad",
    field_type: "text",
    options: [],
    is_builtin: true,
    is_required: false,
    sort_order: 0,
    group_name: "Automatización"
  },
  {
    entity_type: "contact",
    field_key: "prioridad",
    label: "Prioridad",
    field_type: "select",
    options: ["Alta", "Media", "Baja"],
    is_builtin: true,
    is_required: false,
    sort_order: 1,
    group_name: "Automatización"
  },
  {
    entity_type: "contact",
    field_key: "tipo_cliente",
    label: "Tipo de cliente",
    field_type: "select",
    options: ["Prospecto", "Cliente", "Partner"],
    is_builtin: true,
    is_required: false,
    sort_order: 2,
    group_name: "Automatización"
  }
];

export const DEFAULT_LEAD_PROPERTIES: Omit<
  CrmPropertyDefinition,
  "id" | "user_id" | "created_at" | "updated_at"
>[] = [
  {
    entity_type: "lead",
    field_key: "fecha_cierre",
    label: "Fecha cierre esperada",
    field_type: "date",
    options: [],
    is_builtin: true,
    is_required: false,
    sort_order: 0,
    group_name: "Pipeline"
  },
  {
    entity_type: "lead",
    field_key: "probabilidad",
    label: "Probabilidad",
    field_type: "select",
    options: ["10%", "25%", "50%", "75%", "90%"],
    is_builtin: true,
    is_required: false,
    sort_order: 1,
    group_name: "Pipeline"
  },
  {
    entity_type: "lead",
    field_key: "producto",
    label: "Producto de interés",
    field_type: "text",
    options: [],
    is_builtin: true,
    is_required: false,
    sort_order: 2,
    group_name: "Pipeline"
  }
];

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
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

export function toCrmContact(raw: Record<string, unknown>): CrmContact {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    name: String(raw.name),
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ? String(raw.phone) : null,
    company: raw.company ? String(raw.company) : null,
    job_title: raw.job_title ? String(raw.job_title) : null,
    source: raw.source ? String(raw.source) : null,
    notes: raw.notes ? String(raw.notes) : null,
    tags: parseTags(raw.tags),
    metadata: parseMetadata(raw.metadata),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

export function toCrmLead(raw: Record<string, unknown>): CrmLead {
  const contactRaw = raw.contact as Record<string, unknown> | null | undefined;
  const stageRaw = raw.stage as Record<string, unknown> | null | undefined;
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    contact_id: raw.contact_id ? String(raw.contact_id) : null,
    stage_id: String(raw.stage_id),
    title: String(raw.title),
    value_amount: raw.value_amount != null ? Number(raw.value_amount) : null,
    currency: String(raw.currency ?? "COP"),
    source: raw.source ? String(raw.source) : null,
    notes: raw.notes ? String(raw.notes) : null,
    sort_order: Number(raw.sort_order ?? 0),
    outcome: raw.outcome === "won" || raw.outcome === "lost" ? raw.outcome : "open",
    metadata: parseMetadata(raw.metadata),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    contact: contactRaw ? toCrmContact(contactRaw) : null,
    stage: stageRaw ? toCrmStage(stageRaw) : null
  };
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
