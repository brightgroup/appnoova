import type { SupabaseClient } from "@supabase/supabase-js";

export interface InventoryItemRecord {
  id: string;
  organizationId: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  stockMinimo: number | null;
  existencia: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InventoryItemRow {
  id: string;
  organization_id: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  stock_minimo: number | null;
  existencia: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

function toItemRecord(row: InventoryItemRow): InventoryItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    codigo: row.codigo,
    nombre: row.nombre,
    marca: row.marca,
    responsable: row.responsable,
    stockMinimo: row.stock_minimo,
    existencia: row.existencia,
    activo: row.activo,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const POSTGREST_PAGE_SIZE = 1000;

export async function listInventoryItems(
  db: SupabaseClient,
  organizationId: string,
  opts: { search?: string; includeInactive?: boolean } = {}
): Promise<InventoryItemRecord[]> {
  const search = opts.search?.trim();
  const like = search ? `%${search.replace(/[%_]/g, m => `\\${m}`)}%` : null;

  function buildQuery() {
    let q = db
      .from("erp_inventory_items")
      .select("*")
      .eq("organization_id", organizationId)
      .order("nombre", { ascending: true });
    if (!opts.includeInactive) q = q.eq("activo", true);
    if (like) q = q.or(`codigo.ilike.${like},nombre.ilike.${like},marca.ilike.${like}`);
    return q;
  }

  // PostgREST limita a 1000 filas por defecto (db-max-rows del proyecto) aunque
  // no se pida un .limit() explícito — sin esta paginación, cualquier catálogo
  // de más de 1000 productos se veía truncado en silencio (sin error).
  const rows: InventoryItemRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + POSTGREST_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data as InventoryItemRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;
    from += POSTGREST_PAGE_SIZE;
  }

  return rows.map(toItemRecord);
}

export async function getInventoryItem(
  db: SupabaseClient,
  organizationId: string,
  itemId: string
): Promise<InventoryItemRecord | null> {
  const { data, error } = await db
    .from("erp_inventory_items")
    .select("*")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toItemRecord(data as InventoryItemRow) : null;
}

export async function findInventoryItemByCodigo(
  db: SupabaseClient,
  organizationId: string,
  codigo: string
): Promise<InventoryItemRecord | null> {
  const { data, error } = await db
    .from("erp_inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("codigo", codigo.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toItemRecord(data as InventoryItemRow) : null;
}

/** Trae solo los productos cuyo id está en `ids` — para resolver código/nombre de un lote pequeño de movimientos sin traer todo el catálogo. */
export async function getInventoryItemsByIds(
  db: SupabaseClient,
  organizationId: string,
  ids: string[]
): Promise<InventoryItemRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("erp_inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return ((data as InventoryItemRow[] | null) ?? []).map(toItemRecord);
}

export interface InventoryItemInput {
  codigo: string;
  nombre: string;
  marca?: string | null;
  responsable?: string | null;
  stockMinimo?: number | null;
}

/**
 * Crea el producto con existencia en 0 (default de columna) — nunca recibe una
 * existencia directa, para que erp_register_movement() siga siendo la única
 * forma en que existencia cambia (así el kardex nunca queda desincronizado del
 * saldo). Un stock inicial distinto de 0 se registra aparte como movimiento
 * "saldo_inicial" (ver registerInventoryMovement), igual que hace la importación.
 */
export async function createInventoryItem(
  db: SupabaseClient,
  organizationId: string,
  userId: string,
  input: InventoryItemInput
): Promise<InventoryItemRecord> {
  const { data, error } = await db
    .from("erp_inventory_items")
    .insert({
      organization_id: organizationId,
      codigo: input.codigo.trim(),
      nombre: input.nombre.trim(),
      marca: input.marca?.trim() || null,
      responsable: input.responsable?.trim() || null,
      stock_minimo: input.stockMinimo ?? null,
      created_by_user_id: userId
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toItemRecord(data as InventoryItemRow);
}

export interface InventoryItemPatch {
  nombre?: string;
  marca?: string | null;
  responsable?: string | null;
  stockMinimo?: number | null;
  activo?: boolean;
}

export async function updateInventoryItem(
  db: SupabaseClient,
  organizationId: string,
  itemId: string,
  patch: InventoryItemPatch
): Promise<InventoryItemRecord> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nombre !== undefined) updates.nombre = patch.nombre.trim();
  if (patch.marca !== undefined) updates.marca = patch.marca?.trim() || null;
  if (patch.responsable !== undefined) updates.responsable = patch.responsable?.trim() || null;
  if (patch.stockMinimo !== undefined) updates.stock_minimo = patch.stockMinimo;
  if (patch.activo !== undefined) updates.activo = patch.activo;

  const { data, error } = await db
    .from("erp_inventory_items")
    .update(updates)
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toItemRecord(data as InventoryItemRow);
}

export interface InventoryMovementRecord {
  id: string;
  organizationId: string;
  itemId: string;
  tipo: "entrada" | "salida" | "ajuste" | "saldo_inicial";
  delta: number;
  existenciaResultante: number;
  fecha: string;
  responsable: string | null;
  nota: string | null;
  createdByUserId: string | null;
  /** Nombre/email de quien lo registró en el sistema — se completa aparte con attachCreatedByLabels(). */
  createdByLabel?: string | null;
  createdAt: string;
}

interface InventoryMovementRow {
  id: string;
  organization_id: string;
  item_id: string;
  tipo: string;
  delta: number;
  existencia_resultante: number;
  fecha: string;
  responsable: string | null;
  nota: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

function toMovementRecord(row: InventoryMovementRow): InventoryMovementRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    tipo: row.tipo as InventoryMovementRecord["tipo"],
    delta: row.delta,
    existenciaResultante: row.existencia_resultante,
    fecha: row.fecha,
    responsable: row.responsable,
    nota: row.nota,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at
  };
}

export async function listInventoryMovements(
  db: SupabaseClient,
  organizationId: string,
  opts: { itemId?: string; limit?: number } = {}
): Promise<InventoryMovementRecord[]> {
  let query = db
    .from("erp_inventory_movements")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.itemId) query = query.eq("item_id", opts.itemId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data as InventoryMovementRow[] | null) ?? []).map(toMovementRecord);
}

/**
 * Completa createdByLabel (nombre o email de quien registró cada movimiento) —
 * aparte porque created_by_user_id referencia auth.users, no public.profiles,
 * así que PostgREST no puede embeberlo automáticamente en el select.
 */
export async function attachCreatedByLabels(
  db: SupabaseClient,
  movements: InventoryMovementRecord[]
): Promise<InventoryMovementRecord[]> {
  const ids = [...new Set(movements.map(m => m.createdByUserId).filter((v): v is string => Boolean(v)))];
  if (!ids.length) return movements;

  const { data: profiles } = await db.from("profiles").select("id, full_name, email").in("id", ids);
  const labelById = new Map(
    (profiles ?? []).map(p => [p.id as string, (p.full_name as string | null) || (p.email as string | null) || null])
  );

  return movements.map(m => ({
    ...m,
    createdByLabel: m.createdByUserId ? labelById.get(m.createdByUserId) ?? null : null
  }));
}

export interface RegisterMovementInput {
  itemId: string;
  tipo: "entrada" | "salida" | "ajuste" | "saldo_inicial";
  delta: number;
  fecha?: string;
  responsable?: string | null;
  nota?: string | null;
  createdBy?: string | null;
}

export interface RegisterMovementResult {
  existencia: number;
  stockMinimo: number | null;
  debeAlertar: boolean;
  movementId: string;
}

/** Aplica el movimiento vía el RPC erp_register_movement (atómico, ver 103_erp_inventory.sql). */
export async function registerInventoryMovement(
  db: SupabaseClient,
  organizationId: string,
  input: RegisterMovementInput
): Promise<RegisterMovementResult> {
  const { data, error } = await db
    .rpc("erp_register_movement", {
      p_organization_id: organizationId,
      p_item_id: input.itemId,
      p_tipo: input.tipo,
      p_delta: input.delta,
      p_fecha: input.fecha ?? null,
      p_responsable: input.responsable ?? null,
      p_nota: input.nota ?? null,
      p_created_by: input.createdBy ?? null
    })
    .single();

  if (error) throw new Error(error.message);
  const row = data as { existencia: number; stock_minimo: number | null; debe_alertar: boolean; movement_id: string };
  return {
    existencia: row.existencia,
    stockMinimo: row.stock_minimo,
    debeAlertar: row.debe_alertar,
    movementId: row.movement_id
  };
}

export interface DeleteMovementResult {
  itemId: string;
  existencia: number;
}

/** Borra un movimiento y revierte su efecto sobre la existencia vía el RPC erp_delete_movement (atómico, ver 104_erp_delete_movement.sql). */
export async function deleteInventoryMovement(
  db: SupabaseClient,
  organizationId: string,
  movementId: string
): Promise<DeleteMovementResult> {
  const { data, error } = await db
    .rpc("erp_delete_movement", { p_organization_id: organizationId, p_movement_id: movementId })
    .single();

  if (error) throw new Error(error.message);
  const row = data as { item_id: string; existencia: number };
  return { itemId: row.item_id, existencia: row.existencia };
}
