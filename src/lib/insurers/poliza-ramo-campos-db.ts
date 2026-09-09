import type { SupabaseClient } from "@supabase/supabase-js";

export type PolizaCampoFieldType = "text" | "number" | "date" | "select" | "boolean";

export interface PolizaRamoCampoRecord {
  id: string;
  organizationId: string;
  ramoId: string;
  fieldKey: string;
  label: string;
  fieldType: PolizaCampoFieldType;
  options: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface PolizaRamoCampoRow {
  id: string;
  organization_id: string;
  ramo_id: string;
  field_key: string;
  label: string;
  field_type: string;
  options: string[] | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toRecord(row: PolizaRamoCampoRow): PolizaRamoCampoRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ramoId: row.ramo_id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type as PolizaCampoFieldType,
    options: Array.isArray(row.options) ? row.options : [],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function listCamposPorRamo(
  db: SupabaseClient,
  organizationId: string,
  ramoId: string
): Promise<PolizaRamoCampoRecord[]> {
  const { data } = await db
    .from("poliza_ramo_campos")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("ramo_id", ramoId)
    .order("sort_order", { ascending: true });
  return ((data as PolizaRamoCampoRow[] | null) ?? []).map(toRecord);
}

/** Todos los campos de la organización, para armar columnas dinámicas de la tabla sin una consulta por ramo. */
export async function listTodosLosCampos(db: SupabaseClient, organizationId: string): Promise<PolizaRamoCampoRecord[]> {
  const { data } = await db
    .from("poliza_ramo_campos")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  return ((data as PolizaRamoCampoRow[] | null) ?? []).map(toRecord);
}

export async function createCampo(
  db: SupabaseClient,
  organizationId: string,
  input: { ramoId: string; label: string; fieldType: PolizaCampoFieldType; options?: string[] }
): Promise<PolizaRamoCampoRecord> {
  const { count } = await db
    .from("poliza_ramo_campos")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("ramo_id", input.ramoId);

  const { data, error } = await db
    .from("poliza_ramo_campos")
    .insert({
      organization_id: organizationId,
      ramo_id: input.ramoId,
      field_key: slugifyFieldKey(input.label),
      label: input.label,
      field_type: input.fieldType,
      options: input.fieldType === "select" ? input.options ?? [] : [],
      sort_order: count ?? 0
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el campo");
  return toRecord(data as PolizaRamoCampoRow);
}

export async function deleteCampo(db: SupabaseClient, organizationId: string, id: string): Promise<void> {
  await db.from("poliza_ramo_campos").delete().eq("organization_id", organizationId).eq("id", id);
}

/** Reordena en bloque — igual patrón que CrmPropertyConfigPanel: el cliente manda el arreglo completo ya en el orden deseado. */
export async function reorderCampos(db: SupabaseClient, organizationId: string, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      db.from("poliza_ramo_campos").update({ sort_order: index }).eq("organization_id", organizationId).eq("id", id)
    )
  );
}
