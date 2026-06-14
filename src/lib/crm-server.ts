import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmPropertyEntity } from "@/types/crm";
import {
  DEFAULT_CONTACT_PROPERTIES,
  DEFAULT_CRM_STAGES,
  DEFAULT_LEAD_PROPERTIES,
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
