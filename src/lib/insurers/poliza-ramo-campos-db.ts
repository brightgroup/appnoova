import type { SupabaseClient } from "@supabase/supabase-js";

/** multiselect = "elige todas las que apliquen" — siempre se presenta en texto (guided-questions.ts), WhatsApp no tiene botones/lista de selección múltiple. */
export type PolizaCampoFieldType = "text" | "number" | "date" | "select" | "boolean" | "multiselect";
export type PolizaCampoPresentacion = "auto" | "botones" | "lista" | "texto";

export interface PolizaRamoCampoRecord {
  id: string;
  organizationId: string;
  ramoId: string;
  fieldKey: string;
  label: string;
  fieldType: PolizaCampoFieldType;
  options: string[];
  sortOrder: number;
  /** Lo que la IA le dice al cliente para pedir el dato — si es null, se usa `label`. */
  pregunta: string | null;
  /** Explicación corta si el cliente pregunta qué significa el campo. */
  ayuda: string | null;
  presentacion: PolizaCampoPresentacion;
  /** false = campo informativo para el asesor que la IA no pregunta durante la cotización. */
  aplicaCotizacion: boolean;
  /** false = la IA no bloquea la cotización esperando este dato. */
  requeridoCotizacion: boolean;
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
  pregunta: string | null;
  ayuda: string | null;
  presentacion: string;
  aplica_cotizacion: boolean;
  requerido_cotizacion: boolean;
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
    pregunta: row.pregunta,
    ayuda: row.ayuda,
    presentacion: (row.presentacion as PolizaCampoPresentacion) ?? "auto",
    aplicaCotizacion: row.aplica_cotizacion !== false,
    requeridoCotizacion: row.requerido_cotizacion !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const FIELD_TYPES_WITH_OPTIONS: PolizaCampoFieldType[] = ["select", "multiselect"];

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

export interface CreateCampoInput {
  ramoId: string;
  label: string;
  fieldType: PolizaCampoFieldType;
  options?: string[];
  pregunta?: string | null;
  ayuda?: string | null;
  presentacion?: PolizaCampoPresentacion;
  aplicaCotizacion?: boolean;
  requeridoCotizacion?: boolean;
  /** Si no se da, se calcula (al final) — se usa al materializar varios campos en bloque, donde sí importa el orden relativo. */
  sortOrder?: number;
  /** Solo para materializar defaults — normalmente se deriva de `label`. */
  fieldKey?: string;
}

export async function createCampo(db: SupabaseClient, organizationId: string, input: CreateCampoInput): Promise<PolizaRamoCampoRecord> {
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
      field_key: input.fieldKey ?? slugifyFieldKey(input.label),
      label: input.label,
      field_type: input.fieldType,
      options: FIELD_TYPES_WITH_OPTIONS.includes(input.fieldType) ? input.options ?? [] : [],
      sort_order: input.sortOrder ?? count ?? 0,
      pregunta: input.pregunta ?? null,
      ayuda: input.ayuda ?? null,
      presentacion: input.presentacion ?? "auto",
      aplica_cotizacion: input.aplicaCotizacion ?? true,
      requerido_cotizacion: input.requeridoCotizacion ?? true
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el campo");
  return toRecord(data as PolizaRamoCampoRow);
}

/** Inserta varios campos de una sola vez, respetando el `sortOrder` de cada uno — usado para materializar los valores por defecto de un ramo la primera vez que la organización guarda algo ahí. */
export async function createCamposBulk(db: SupabaseClient, organizationId: string, inputs: CreateCampoInput[]): Promise<PolizaRamoCampoRecord[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await db
    .from("poliza_ramo_campos")
    .insert(
      inputs.map(input => ({
        organization_id: organizationId,
        ramo_id: input.ramoId,
        field_key: input.fieldKey ?? slugifyFieldKey(input.label),
        label: input.label,
        field_type: input.fieldType,
        options: FIELD_TYPES_WITH_OPTIONS.includes(input.fieldType) ? input.options ?? [] : [],
        sort_order: input.sortOrder ?? 0,
        pregunta: input.pregunta ?? null,
        ayuda: input.ayuda ?? null,
        presentacion: input.presentacion ?? "auto",
        aplica_cotizacion: input.aplicaCotizacion ?? true,
        requerido_cotizacion: input.requeridoCotizacion ?? true
      }))
    )
    .select("*");

  if (error || !data) throw new Error(error?.message ?? "No se pudieron crear los campos");
  return (data as PolizaRamoCampoRow[]).map(toRecord);
}

export interface UpdateCampoInput {
  label?: string;
  fieldType?: PolizaCampoFieldType;
  options?: string[];
  pregunta?: string | null;
  ayuda?: string | null;
  presentacion?: PolizaCampoPresentacion;
  aplicaCotizacion?: boolean;
  requeridoCotizacion?: boolean;
}

export async function updateCampo(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  input: UpdateCampoInput
): Promise<PolizaRamoCampoRecord> {
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.fieldType !== undefined) patch.field_type = input.fieldType;
  if (input.options !== undefined) patch.options = input.options;
  if (input.pregunta !== undefined) patch.pregunta = input.pregunta;
  if (input.ayuda !== undefined) patch.ayuda = input.ayuda;
  if (input.presentacion !== undefined) patch.presentacion = input.presentacion;
  if (input.aplicaCotizacion !== undefined) patch.aplica_cotizacion = input.aplicaCotizacion;
  if (input.requeridoCotizacion !== undefined) patch.requerido_cotizacion = input.requeridoCotizacion;

  const { data, error } = await db
    .from("poliza_ramo_campos")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo actualizar el campo");
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
