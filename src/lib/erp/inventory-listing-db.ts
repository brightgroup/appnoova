import type { SupabaseClient } from "@supabase/supabase-js";
import { isLowStock } from "@/types/erp";
import { listInventoryItems, type InventoryItemRecord } from "@/lib/erp/inventory-db";

/**
 * Listado paginado de inventario para la vista móvil (/m/inventario).
 *
 * Aparte de `listInventoryItems`, que trae el catálogo completo a memoria a
 * propósito (lo necesita el ERP de escritorio, que ordena y exporta todo). Un
 * celular pidiendo página por página no puede pagar ese costo en cada scroll,
 * así que acá se pagina de verdad contra PostgREST con `range` + `count`.
 *
 * La excepción es el filtro "bajo mínimo": compara dos columnas entre sí
 * (`existencia <= stock_minimo`) y PostgREST no expresa eso en un filtro. Para
 * ese caso se cae al camino completo y se corta en memoria — es el mismo costo
 * que ya paga la tool de Ori hoy, y el conjunto de productos agotándose es
 * chico comparado con el catálogo.
 */

export interface InventoryListingRow {
  id: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  existencia: number;
  stockMinimo: number | null;
  bajoMinimo: boolean;
}

export interface InventoryListingPage {
  items: InventoryListingRow[];
  total: number;
  hasMore: boolean;
}

export interface InventoryListingQuery {
  search?: string;
  marca?: string;
  soloBajoMinimo?: boolean;
  offset?: number;
  limit?: number;
}

interface ListingRow {
  id: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  stock_minimo: number | null;
  existencia: number;
}

const MAX_LIMIT = 50;

function toListingRow(row: ListingRow): InventoryListingRow {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    marca: row.marca,
    responsable: row.responsable,
    existencia: row.existencia,
    stockMinimo: row.stock_minimo,
    bajoMinimo: isLowStock({ existencia: row.existencia, stockMinimo: row.stock_minimo })
  };
}

function fromRecord(item: InventoryItemRecord): InventoryListingRow {
  return {
    id: item.id,
    codigo: item.codigo,
    nombre: item.nombre,
    marca: item.marca,
    responsable: item.responsable,
    existencia: item.existencia,
    stockMinimo: item.stockMinimo,
    bajoMinimo: isLowStock(item)
  };
}

export async function listInventoryPage(
  db: SupabaseClient,
  organizationId: string,
  query: InventoryListingQuery = {}
): Promise<InventoryListingPage> {
  const offset = Math.max(0, Math.round(Number(query.offset) || 0));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(Number(query.limit) || 25)));
  const search = query.search?.trim();
  const marca = query.marca?.trim();

  if (query.soloBajoMinimo) {
    const all = await listInventoryItems(db, organizationId, { search: search || undefined });
    const filtered = all
      .filter(i => (marca ? i.marca?.trim().toLowerCase() === marca.toLowerCase() : true))
      .filter(isLowStock);
    return {
      items: filtered.slice(offset, offset + limit).map(fromRecord),
      total: filtered.length,
      hasMore: offset + limit < filtered.length
    };
  }

  let q = db
    .from("erp_inventory_items")
    .select("id, codigo, nombre, marca, responsable, stock_minimo, existencia", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (search) {
    const like = `%${search.replace(/[%_]/g, m => `\\${m}`)}%`;
    q = q.or(`codigo.ilike.${like},nombre.ilike.${like},marca.ilike.${like}`);
  }
  if (marca) q = q.ilike("marca", marca);

  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const items = ((data as ListingRow[] | null) ?? []).map(toListingRow);
  const total = count ?? offset + items.length;
  return { items, total, hasMore: offset + items.length < total };
}

/** Marcas distintas del catálogo, para los chips de filtro de la vista móvil. */
export async function listInventoryBrands(db: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data, error } = await db
    .from("erp_inventory_items")
    .select("marca")
    .eq("organization_id", organizationId)
    .eq("activo", true)
    .not("marca", "is", null)
    .limit(1000);
  if (error) return [];

  const marcas = new Set<string>();
  for (const row of (data as { marca: string | null }[] | null) ?? []) {
    const marca = row.marca?.trim();
    if (marca) marcas.add(marca);
  }
  return [...marcas].sort((a, b) => a.localeCompare(b, "es"));
}
