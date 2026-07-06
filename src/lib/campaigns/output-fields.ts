import type {
  CampaignCrmConfig,
  CampaignOutputField,
  CampaignOutputFieldType,
  CampaignType,
  VoiceCampaignRecord,
} from "@/types/voice-campaign";
import type { CrmPropertyDefinition, CrmPropertyFieldType } from "@/types/crm";
import { slugifyVariableKey } from "@/lib/campaigns/render-prompt";

/** Campos builtin de la ficha de contacto a los que se puede vincular un campo de campaña. */
export const CONTACT_LINK_BUILTIN_TARGETS: {
  field: string;
  label: string;
  types: CampaignOutputFieldType[];
}[] = [
  { field: "name", label: "Nombre", types: ["text"] },
  { field: "email", label: "Email", types: ["text"] },
  { field: "ciudad", label: "Ciudad", types: ["text", "select"] },
  { field: "organizacion", label: "Organización", types: ["text"] },
  { field: "documento_id", label: "Documento", types: ["text", "number"] },
  { field: "notes", label: "Notas", types: ["text"] },
];

/** ¿Es compatible el tipo del campo de campaña con el tipo de la propiedad CRM? */
export function isContactLinkCompatible(
  fieldType: CampaignOutputFieldType,
  crmType: CrmPropertyFieldType,
  campaignOptions: string[],
  crmOptions: string[]
): boolean {
  switch (fieldType) {
    case "select":
      if (crmType === "text" || crmType === "textarea") return true;
      if (crmType === "select") {
        const set = new Set(crmOptions.map(o => o.trim().toLowerCase()));
        return campaignOptions.every(o => set.has(o.trim().toLowerCase()));
      }
      return false;
    case "text":
      return crmType === "text" || crmType === "textarea";
    case "boolean":
      return crmType === "boolean";
    case "date":
      return crmType === "date";
    case "time":
      return crmType === "text";
    case "number":
      return crmType === "number" || crmType === "text";
    default:
      return false;
  }
}

/** Destinos de vínculo disponibles para un campo, combinando builtin + propiedades custom. */
export function contactLinkTargets(
  field: Pick<CampaignOutputField, "field_type" | "options">,
  properties: CrmPropertyDefinition[]
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const b of CONTACT_LINK_BUILTIN_TARGETS) {
    if (b.types.includes(field.field_type)) out.push({ value: b.field, label: b.label });
  }
  for (const p of properties) {
    if (p.entity_type !== "contact") continue;
    if (isContactLinkCompatible(field.field_type, p.field_type, field.options, p.options)) {
      out.push({ value: `metadata.${p.field_key}`, label: p.label });
    }
  }
  return out;
}

export function newOutputField(partial?: Partial<CampaignOutputField>): CampaignOutputField {
  return {
    key: "",
    label: "",
    field_type: "text",
    options: [],
    ai_instruction: "",
    required: false,
    is_primary: false,
    contact_link: null,
    ...partial,
  };
}

export function normalizeOutputFields(raw: unknown): CampaignOutputField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map(f => ({
      key: String(f.key ?? "").trim(),
      label: String(f.label ?? "").trim(),
      field_type: (f.field_type as CampaignOutputFieldType) ?? "text",
      options: Array.isArray(f.options) ? f.options.map(String) : [],
      ai_instruction: String(f.ai_instruction ?? "").trim(),
      required: Boolean(f.required),
      is_primary: Boolean(f.is_primary),
      contact_link:
        f.contact_link && typeof f.contact_link === "object"
          ? {
              contact_field: String((f.contact_link as Record<string, unknown>).contact_field ?? ""),
              mode:
                (f.contact_link as Record<string, unknown>).mode === "overwrite"
                  ? ("overwrite" as const)
                  : ("fill_empty" as const),
            }
          : null,
    }))
    .filter(f => f.label || f.key);
}

/** Valida el set de campos de salida. Devuelve mensaje de error o null. */
export function validateOutputFields(
  fields: CampaignOutputField[],
  opts?: { requirePrimary?: boolean }
): string | null {
  const keys = new Set<string>();
  let primaryCount = 0;

  for (const f of fields) {
    if (!f.label.trim()) return "Todos los campos deben tener nombre";
    const key = f.key || slugifyVariableKey(f.label);
    if (keys.has(key)) return `Campo duplicado: "${f.label}"`;
    keys.add(key);
    if (f.field_type === "select" && f.options.filter(o => o.trim()).length < 2) {
      return `La lista "${f.label}" necesita al menos 2 opciones`;
    }
    if (!f.ai_instruction.trim()) {
      return `El campo "${f.label}" necesita la instrucción para la IA`;
    }
    if (f.is_primary) {
      primaryCount += 1;
      if (f.field_type !== "select") {
        return "La tipificación principal debe ser una lista desplegable";
      }
    }
  }

  if (primaryCount > 1) return "Solo puede haber una tipificación principal";
  if (opts?.requirePrimary && primaryCount === 0) {
    return "Marca un campo tipo lista como tipificación principal antes de activar la campaña";
  }
  return null;
}

/** Asigna keys faltantes derivadas del label. */
export function withFieldKeys(fields: CampaignOutputField[]): CampaignOutputField[] {
  const used = new Set<string>();
  return fields.map(f => {
    let key = f.key || slugifyVariableKey(f.label);
    let n = 2;
    while (used.has(key)) key = `${slugifyVariableKey(f.label)}_${n++}`;
    used.add(key);
    return { ...f, key };
  });
}

export function primaryOutputField(fields: CampaignOutputField[]): CampaignOutputField | null {
  return fields.find(f => f.is_primary) ?? null;
}

export function defaultCrmConfig(type: CampaignType): CampaignCrmConfig {
  switch (type) {
    case "prospeccion":
      return { create_leads: "on_interest", interest_values: [], pipeline_stage_id: null };
    case "seguimiento":
      return { create_leads: "on_import", interest_values: [], pipeline_stage_id: null };
    case "encuesta":
    case "notificacion":
      return { create_leads: "never", interest_values: [], pipeline_stage_id: null };
  }
}

export function normalizeCrmConfig(raw: unknown, type: CampaignType): CampaignCrmConfig {
  const base = defaultCrmConfig(type);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const createLeads = String(r.create_leads ?? "");
  return {
    create_leads:
      createLeads === "on_interest" || createLeads === "on_import" || createLeads === "never"
        ? (createLeads as CampaignCrmConfig["create_leads"])
        : base.create_leads,
    interest_values: Array.isArray(r.interest_values) ? r.interest_values.map(String) : [],
    pipeline_stage_id: r.pipeline_stage_id ? String(r.pipeline_stage_id) : null,
  };
}

/** Tras activar: tipos y opciones quedan congelados; solo se puede ajustar la instrucción IA. */
export function mergeOutputFieldsRespectingLock(
  existing: CampaignOutputField[],
  incoming: CampaignOutputField[],
  locked: boolean
): CampaignOutputField[] {
  if (!locked) return withFieldKeys(incoming);
  return existing.map(prev => {
    const next = incoming.find(f => f.key === prev.key);
    if (!next) return prev;
    return {
      ...prev,
      label: next.label.trim() || prev.label,
      ai_instruction: next.ai_instruction,
      required: next.required,
      contact_link: next.contact_link ?? null,
    };
  });
}

export function isCampaignConfigLocked(campaign: Pick<VoiceCampaignRecord, "status">): boolean {
  return campaign.status !== "draft";
}
