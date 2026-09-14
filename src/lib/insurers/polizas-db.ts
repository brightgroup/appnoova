import type { SupabaseClient } from "@supabase/supabase-js";

export type PolizaEstado =
  | "cotizada"
  | "expedicion"
  | "activa"
  | "vencida"
  | "cancelada"
  | "no_renovada"
  | "renovada"
  | "devengada";
export type PolizaFuente = "manual" | "excel" | "pdf_ia" | "cotizador" | "softseguros";
export type PolizaPeriodicidad = "anual" | "semestral" | "trimestral" | "mensual";
export type PolizaTipo = "individual" | "colectiva" | "masiva";

export interface PolizaRecord {
  id: string;
  userId: string;
  contactId: string;
  aseguradora: string;
  ramo: string;
  ramoId: string | null;
  numeroPoliza: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  prima: number | null;
  periodicidadPago: PolizaPeriodicidad | null;
  estado: PolizaEstado;
  fuente: PolizaFuente;
  tipoPoliza: PolizaTipo;
  moneda: string;
  tasaCambio: number;
  aseguradoNombre: string | null;
  aseguradoDocumento: string | null;
  porcentajeComisionAgencia: number | null;
  comisionAgencia: number | null;
  vendedorUserId: string | null;
  porcentajeComisionVendedor: number | null;
  comisionVendedor: number | null;
  esSoat: boolean;
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
  ramo_id: string | null;
  numero_poliza: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  prima: number | null;
  periodicidad_pago: string | null;
  estado: string;
  fuente: string;
  tipo_poliza: string;
  moneda: string;
  tasa_cambio: number;
  asegurado_nombre: string | null;
  asegurado_documento: string | null;
  porcentaje_comision_agencia: number | null;
  comision_agencia: number | null;
  vendedor_user_id: string | null;
  porcentaje_comision_vendedor: number | null;
  comision_vendedor: number | null;
  es_soat: boolean;
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
    ramoId: row.ramo_id,
    numeroPoliza: row.numero_poliza,
    vigenciaDesde: row.vigencia_desde,
    vigenciaHasta: row.vigencia_hasta,
    prima: row.prima,
    periodicidadPago: row.periodicidad_pago as PolizaPeriodicidad | null,
    estado: row.estado as PolizaEstado,
    fuente: row.fuente as PolizaFuente,
    tipoPoliza: (row.tipo_poliza as PolizaTipo) ?? "individual",
    moneda: row.moneda ?? "COP",
    tasaCambio: row.tasa_cambio ?? 1,
    aseguradoNombre: row.asegurado_nombre,
    aseguradoDocumento: row.asegurado_documento,
    porcentajeComisionAgencia: row.porcentaje_comision_agencia,
    comisionAgencia: row.comision_agencia,
    vendedorUserId: row.vendedor_user_id,
    porcentajeComisionVendedor: row.porcentaje_comision_vendedor,
    comisionVendedor: row.comision_vendedor,
    esSoat: row.es_soat ?? false,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface PolizaCreateInput {
  contactId: string;
  aseguradora: string;
  ramo: string;
  ramoId?: string | null;
  numeroPoliza?: string | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  prima?: number | null;
  periodicidadPago?: PolizaPeriodicidad | null;
  estado?: PolizaEstado;
  fuente?: PolizaFuente;
  tipoPoliza?: PolizaTipo;
  moneda?: string;
  tasaCambio?: number;
  aseguradoNombre?: string | null;
  aseguradoDocumento?: string | null;
  porcentajeComisionAgencia?: number | null;
  comisionAgencia?: number | null;
  vendedorUserId?: string | null;
  porcentajeComisionVendedor?: number | null;
  comisionVendedor?: number | null;
  esSoat?: boolean;
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
      ramo_id: input.ramoId ?? null,
      numero_poliza: input.numeroPoliza ?? null,
      vigencia_desde: input.vigenciaDesde ?? null,
      vigencia_hasta: input.vigenciaHasta ?? null,
      prima: input.prima ?? null,
      periodicidad_pago: input.periodicidadPago ?? null,
      estado: input.estado ?? "activa",
      fuente: input.fuente ?? "manual",
      tipo_poliza: input.tipoPoliza ?? "individual",
      moneda: input.moneda ?? "COP",
      tasa_cambio: input.tasaCambio ?? 1,
      asegurado_nombre: input.aseguradoNombre ?? null,
      asegurado_documento: input.aseguradoDocumento ?? null,
      porcentaje_comision_agencia: input.porcentajeComisionAgencia ?? null,
      comision_agencia: input.comisionAgencia ?? null,
      vendedor_user_id: input.vendedorUserId ?? null,
      porcentaje_comision_vendedor: input.porcentajeComisionVendedor ?? null,
      comision_vendedor: input.comisionVendedor ?? null,
      es_soat: input.esSoat ?? false,
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
  ramoId?: string | null;
  numeroPoliza?: string | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  prima?: number | null;
  periodicidadPago?: PolizaPeriodicidad | null;
  estado?: PolizaEstado;
  tipoPoliza?: PolizaTipo;
  moneda?: string;
  tasaCambio?: number;
  aseguradoNombre?: string | null;
  aseguradoDocumento?: string | null;
  porcentajeComisionAgencia?: number | null;
  comisionAgencia?: number | null;
  vendedorUserId?: string | null;
  porcentajeComisionVendedor?: number | null;
  comisionVendedor?: number | null;
  esSoat?: boolean;
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
  if (patch.ramoId !== undefined) update.ramo_id = patch.ramoId;
  if (patch.numeroPoliza !== undefined) update.numero_poliza = patch.numeroPoliza;
  if (patch.vigenciaDesde !== undefined) update.vigencia_desde = patch.vigenciaDesde;
  if (patch.vigenciaHasta !== undefined) update.vigencia_hasta = patch.vigenciaHasta;
  if (patch.prima !== undefined) update.prima = patch.prima;
  if (patch.periodicidadPago !== undefined) update.periodicidad_pago = patch.periodicidadPago;
  if (patch.estado !== undefined) update.estado = patch.estado;
  if (patch.tipoPoliza !== undefined) update.tipo_poliza = patch.tipoPoliza;
  if (patch.moneda !== undefined) update.moneda = patch.moneda;
  if (patch.tasaCambio !== undefined) update.tasa_cambio = patch.tasaCambio;
  if (patch.aseguradoNombre !== undefined) update.asegurado_nombre = patch.aseguradoNombre;
  if (patch.aseguradoDocumento !== undefined) update.asegurado_documento = patch.aseguradoDocumento;
  if (patch.porcentajeComisionAgencia !== undefined) update.porcentaje_comision_agencia = patch.porcentajeComisionAgencia;
  if (patch.comisionAgencia !== undefined) update.comision_agencia = patch.comisionAgencia;
  if (patch.vendedorUserId !== undefined) update.vendedor_user_id = patch.vendedorUserId;
  if (patch.porcentajeComisionVendedor !== undefined) update.porcentaje_comision_vendedor = patch.porcentajeComisionVendedor;
  if (patch.comisionVendedor !== undefined) update.comision_vendedor = patch.comisionVendedor;
  if (patch.esSoat !== undefined) update.es_soat = patch.esSoat;
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
      ramoId: input.ramoId,
      vigenciaDesde: input.vigenciaDesde,
      vigenciaHasta: input.vigenciaHasta,
      prima: input.prima,
      periodicidadPago: input.periodicidadPago,
      estado: input.estado,
      tipoPoliza: input.tipoPoliza,
      moneda: input.moneda,
      tasaCambio: input.tasaCambio,
      aseguradoNombre: input.aseguradoNombre,
      aseguradoDocumento: input.aseguradoDocumento,
      porcentajeComisionAgencia: input.porcentajeComisionAgencia,
      comisionAgencia: input.comisionAgencia,
      porcentajeComisionVendedor: input.porcentajeComisionVendedor,
      comisionVendedor: input.comisionVendedor,
      esSoat: input.esSoat,
      metadata: input.metadata
    });
    if (!updated) throw new Error("No se pudo actualizar la póliza existente");
    return { record: updated, created: false };
  }

  const created = await createPoliza(db, userId, { ...input, numeroPoliza });
  return { record: created, created: true };
}

/** Resuelve un ramo_id de ramos_catalogo por nombre (case-insensitive) — usado por el mapper de Softseguros y por el combobox de ramo. */
export async function findRamoCatalogoPorNombre(db: SupabaseClient, nombre: string): Promise<string | null> {
  const { data } = await db.from("ramos_catalogo").select("id").ilike("nombre", nombre).maybeSingle();
  return data ? (data.id as string) : null;
}
