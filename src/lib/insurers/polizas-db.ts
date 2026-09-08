import type { SupabaseClient } from "@supabase/supabase-js";

export type PolizaEstado = "cotizada" | "activa" | "vencida" | "cancelada" | "renovada";
export type PolizaFuente = "manual" | "excel" | "pdf_ia" | "cotizador" | "softseguros";
export type PolizaPeriodicidad = "anual" | "semestral" | "trimestral" | "mensual";

export interface PolizaRecord {
  id: string;
  userId: string;
  contactId: string;
  aseguradora: string;
  ramo: string;
  numeroPoliza: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  prima: number | null;
  periodicidadPago: PolizaPeriodicidad | null;
  estado: PolizaEstado;
  fuente: PolizaFuente;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface PolizaRow {
  id: string;
  user_id: string;
  contact_id: string;
  aseguradora: string;
  ramo: string;
  numero_poliza: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  prima: number | null;
  periodicidad_pago: string | null;
  estado: string;
  fuente: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: PolizaRow): PolizaRecord {
  return {
    id: row.id,
    userId: row.user_id,
    contactId: row.contact_id,
    aseguradora: row.aseguradora,
    ramo: row.ramo,
    numeroPoliza: row.numero_poliza,
    vigenciaDesde: row.vigencia_desde,
    vigenciaHasta: row.vigencia_hasta,
    prima: row.prima,
    periodicidadPago: row.periodicidad_pago as PolizaPeriodicidad | null,
    estado: row.estado as PolizaEstado,
    fuente: row.fuente as PolizaFuente,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface PolizaCreateInput {
  contactId: string;
  aseguradora: string;
  ramo: string;
  numeroPoliza?: string | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  prima?: number | null;
  periodicidadPago?: PolizaPeriodicidad | null;
  estado?: PolizaEstado;
  fuente?: PolizaFuente;
  metadata?: Record<string, unknown>;
}

export async function createPoliza(
  db: SupabaseClient,
  userId: string,
  input: PolizaCreateInput
): Promise<PolizaRecord> {
  const { data, error } = await db
    .from("polizas")
    .insert({
      user_id: userId,
      contact_id: input.contactId,
      aseguradora: input.aseguradora,
      ramo: input.ramo,
      numero_poliza: input.numeroPoliza ?? null,
      vigencia_desde: input.vigenciaDesde ?? null,
      vigencia_hasta: input.vigenciaHasta ?? null,
      prima: input.prima ?? null,
      periodicidad_pago: input.periodicidadPago ?? null,
      estado: input.estado ?? "activa",
      fuente: input.fuente ?? "manual",
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la póliza");
  return toRecord(data as PolizaRow);
}

export interface PolizaListFilter {
  estado?: PolizaEstado;
  ramo?: string;
  aseguradora?: string;
  search?: string;
  /** vigencia_hasta <= esta fecha (ISO yyyy-mm-dd) — para "próximas a vencer". */
  venceAntesDe?: string;
}

export async function listPolizas(
  db: SupabaseClient,
  userId: string,
  filter?: PolizaListFilter
): Promise<PolizaRecord[]> {
  let query = db
    .from("polizas")
    .select("*")
    .eq("user_id", userId)
    .order("vigencia_hasta", { ascending: true, nullsFirst: false });

  if (filter?.estado) query = query.eq("estado", filter.estado);
  if (filter?.ramo) query = query.eq("ramo", filter.ramo);
  if (filter?.aseguradora) query = query.eq("aseguradora", filter.aseguradora);
  if (filter?.venceAntesDe) query = query.lte("vigencia_hasta", filter.venceAntesDe);
  if (filter?.search) {
    query = query.or(`numero_poliza.ilike.%${filter.search}%,aseguradora.ilike.%${filter.search}%`);
  }

  const { data } = await query;
  return ((data as PolizaRow[] | null) ?? []).map(toRecord);
}

export async function getPolizaById(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<PolizaRecord | null> {
  const { data } = await db.from("polizas").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  return data ? toRecord(data as PolizaRow) : null;
}

/** Pólizas activas cuya vigencia_hasta cae exactamente en esa fecha (yyyy-mm-dd) — es lo que el cron de renovaciones necesita por hito. */
export async function listPolizasQueVencenEn(
  db: SupabaseClient,
  userId: string,
  fechaISO: string
): Promise<PolizaRecord[]> {
  const { data } = await db
    .from("polizas")
    .select("*")
    .eq("user_id", userId)
    .eq("estado", "activa")
    .eq("vigencia_hasta", fechaISO);
  return ((data as PolizaRow[] | null) ?? []).map(toRecord);
}

export interface PolizaUpdateInput {
  aseguradora?: string;
  ramo?: string;
  numeroPoliza?: string | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  prima?: number | null;
  periodicidadPago?: PolizaPeriodicidad | null;
  estado?: PolizaEstado;
  metadata?: Record<string, unknown>;
}

export async function updatePoliza(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: PolizaUpdateInput
): Promise<PolizaRecord | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.aseguradora !== undefined) update.aseguradora = patch.aseguradora;
  if (patch.ramo !== undefined) update.ramo = patch.ramo;
  if (patch.numeroPoliza !== undefined) update.numero_poliza = patch.numeroPoliza;
  if (patch.vigenciaDesde !== undefined) update.vigencia_desde = patch.vigenciaDesde;
  if (patch.vigenciaHasta !== undefined) update.vigencia_hasta = patch.vigenciaHasta;
  if (patch.prima !== undefined) update.prima = patch.prima;
  if (patch.periodicidadPago !== undefined) update.periodicidad_pago = patch.periodicidadPago;
  if (patch.estado !== undefined) update.estado = patch.estado;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;

  const { data, error } = await db
    .from("polizas")
    .update(update)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return null;
  return toRecord(data as PolizaRow);
}

export async function deletePoliza(db: SupabaseClient, userId: string, id: string): Promise<void> {
  await db.from("polizas").delete().eq("user_id", userId).eq("id", id);
}

/**
 * Dedup por número de póliza — usada por importación masiva y por el sync de
 * Softseguros. Si ya existe una póliza con ese número para este usuario, la
 * actualiza en vez de duplicarla; si no, la crea.
 */
export async function upsertPolizaPorNumero(
  db: SupabaseClient,
  userId: string,
  numeroPoliza: string,
  input: PolizaCreateInput
): Promise<{ record: PolizaRecord; created: boolean }> {
  const { data: existing } = await db
    .from("polizas")
    .select("id")
    .eq("user_id", userId)
    .eq("numero_poliza", numeroPoliza)
    .maybeSingle();

  if (existing) {
    const updated = await updatePoliza(db, userId, existing.id as string, {
      aseguradora: input.aseguradora,
      ramo: input.ramo,
      vigenciaDesde: input.vigenciaDesde,
      vigenciaHasta: input.vigenciaHasta,
      prima: input.prima,
      periodicidadPago: input.periodicidadPago,
      estado: input.estado,
      metadata: input.metadata
    });
    if (!updated) throw new Error("No se pudo actualizar la póliza existente");
    return { record: updated, created: false };
  }

  const created = await createPoliza(db, userId, { ...input, numeroPoliza });
  return { record: created, created: true };
}
