import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmPropertyEntity } from "@/types/crm";
import {
  DEFAULT_CONTACT_PROPERTIES,
  DEFAULT_CRM_STAGES,
  DEFAULT_LEAD_PROPERTIES,
  INSURANCE_LEAD_PROPERTIES,
  INSURANCE_PIPELINE_TEMPLATE,
  toCrmPropertyDefinition,
  toCrmStage
} from "@/lib/crm-record";

export async function ensureDefaultCrmStages(db: SupabaseClient, userId: string) {
  const { count } = await db
    .from("crm_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return;

  await db.from("crm_pipeline_stages").insert(
    DEFAULT_CRM_STAGES.map(s => ({
      user_id: userId,
      ...s
    }))
  );
}

/**
 * Aplica INSURANCE_PIPELINE_TEMPLATE (crm-record.ts) — solo agrega las
 * etapas que falten por slug, nunca borra ni pisa las existentes. La llama
 * tanto el botón manual (/api/crm/pipeline/apply-template) como la
 * activación del módulo `seguros` desde superadmin (para que un corredor
 * nuevo quede con todo listo de una vez, sin un segundo paso aparte).
 */
export async function applyInsurancePipelineTemplate(db: SupabaseClient, userId: string): Promise<void> {
  await ensureDefaultCrmStages(db, userId);

  const { data: existing, count } = await db
    .from("crm_pipeline_stages")
    .select("slug", { count: "exact" })
    .eq("user_id", userId);
  const existingSlugs = new Set((existing ?? []).map(s => s.slug as string));

  let sortOrder = count ?? 0;
  const toInsert = INSURANCE_PIPELINE_TEMPLATE.filter(t => !existingSlugs.has(t.slug)).map(t => ({
    user_id: userId,
    name: t.name,
    slug: t.slug,
    color: t.color,
    sort_order: sortOrder++,
    is_won: false,
    is_lost: false
  }));
  if (toInsert.length) await db.from("crm_pipeline_stages").insert(toInsert);
}

export async function getCrmStages(db: SupabaseClient, userId: string) {
  await ensureDefaultCrmStages(db, userId);
  const { data, error } = await db
    .from("crm_pipeline_stages")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");

  if (error) throw error;
  return (data ?? [])
    .map(row => toCrmStage(row))
    .filter(s => !s.is_won && !s.is_lost);
}

const DEFAULTS_BY_ENTITY: Record<CrmPropertyEntity, typeof DEFAULT_CONTACT_PROPERTIES> = {
  contact: DEFAULT_CONTACT_PROPERTIES,
  lead: DEFAULT_LEAD_PROPERTIES
};

export async function ensureDefaultCrmProperties(
  db: SupabaseClient,
  userId: string,
  entityType: CrmPropertyEntity
) {
  const { count } = await db
    .from("crm_property_definitions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", entityType);

  if ((count ?? 0) > 0) return;

  const defaults = DEFAULTS_BY_ENTITY[entityType];
  if (!defaults.length) return;

  await db.from("crm_property_definitions").insert(
    defaults.map(p => ({
      user_id: userId,
      ...p
    }))
  );
}

/**
 * Siembra los campos de seguros (placa, Fasecolda, prima, etc.) para el
 * tenant CRM de la organización — llamado al activar el módulo `seguros`
 * (ver /api/admin/organizations/[id]/route.ts). Idempotente: si ya existe
 * `placa` para este user_id, no inserta de nuevo. No toca ni borra ningún
 * campo existente de otras organizaciones.
 */
export async function ensureInsuranceCrmProperties(db: SupabaseClient, userId: string) {
  const { count } = await db
    .from("crm_property_definitions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", "lead")
    .eq("field_key", "placa");

  if ((count ?? 0) > 0) return;

  await db.from("crm_property_definitions").insert(
    INSURANCE_LEAD_PROPERTIES.map(p => ({
      user_id: userId,
      ...p
    }))
  );
}

export async function getCrmProperties(
  db: SupabaseClient,
  userId: string,
  entityType: CrmPropertyEntity
) {
  await ensureDefaultCrmProperties(db, userId, entityType);
  const { data, error } = await db
    .from("crm_property_definitions")
    .select("*")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map(row => toCrmPropertyDefinition(row));
}
