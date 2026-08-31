"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Settings, MoreHorizontal, AlertTriangle, Package, ArrowLeftRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import {
  btnGhost,
  btnPrimary,
  btnFilterGroup,
  btnFilterActive,
  btnFilterIdle,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  registryTableRowClickable,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { useSortableRows } from "@/hooks/useSortableRows";
import { SortableTh } from "@/components/ui/SortableTh";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import { InventoryItemModal, type InventoryItemFormValues } from "@/components/erp/InventoryItemModal";
import { MovementModal, type MovementFormValues } from "@/components/erp/MovementModal";
import { InventoryImportDialog } from "@/components/erp/InventoryImportDialog";
import { isLowStock, type InventoryItem } from "@/types/erp";

type Filter = "all" | "bajo_minimo" | "sin_existencia";
type SortKey = "codigo" | "nombre" | "marca" | "responsable" | "stock_minimo" | "existencia";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "bajo_minimo", label: "Bajo mínimo" },
  { id: "sin_existencia", label: "Sin existencia" }
];

export default function ErpInventarioPage() {
  const router = useRouter();
  const { canWrite: canRegisterMovements } = useModuleWriteAccess("erp", "edit");
  const { canWrite: canCreateItem } = useModuleWriteAccess("erp", "edit");
  const { canWrite: canManage } = useModuleWriteAccess("erp", "manage");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [itemModal, setItemModal] = useState<{ item?: InventoryItem } | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const url = search.trim() ? `/api/erp/inventario/items?q=${encodeURIComponent(search.trim())}` : "/api/erp/inventario/items";
    const res = await authFetch(url);
    if (res.ok) {
      const json = await res.json();
      setItems(json.items ?? []);
    }
    if (!silent) setLoading(false);
  }, [search]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "bajo_minimo") return items.filter(isLowStock);
    if (filter === "sin_existencia") return items.filter(i => i.existencia <= 0);
    return items;
  }, [items, filter]);

  const getSortValue = useCallback((item: InventoryItem, key: SortKey): string | number | null => {
    switch (key) {
      case "codigo": return item.codigo;
      case "nombre": return item.nombre;
      case "marca": return item.marca ?? "";
      case "responsable": return item.responsable ?? "";
      case "stock_minimo": return item.stockMinimo;
      case "existencia": return item.existencia;
    }
  }, []);
  const { sort, toggleSort, sorted } = useSortableRows(filtered, getSortValue);

  const pagination = useRegistryPagination(sorted.length, `${search}-${filter}`);
  const pageRows = pagination.pageRows(sorted);
  const lowStockCount = useMemo(() => items.filter(isLowStock).length, [items]);
  const noStockCount = useMemo(() => items.filter(i => i.existencia <= 0).length, [items]);

  async function submitItem(values: InventoryItemFormValues) {
    setItemSaving(true);
    setItemError(null);
    const editing = itemModal?.item;
    const res = editing
      ? await authFetch(`/api/erp/inventario/items/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre: values.nombre,
            marca: values.marca || null,
            responsable: values.responsable || null,
            stock_minimo: values.stock_minimo === "" ? null : Number(values.stock_minimo)
          })
        })
      : await authFetch("/api/erp/inventario/items", {
          method: "POST",
          body: JSON.stringify({
            codigo: values.codigo,
            nombre: values.nombre,
            marca: values.marca || null,
            responsable: values.responsable || null,
            stock_minimo: values.stock_minimo === "" ? null : Number(values.stock_minimo),
            existencia: values.existencia === "" ? 0 : Number(values.existencia)
          })
        });
    const json = await res.json();
    setItemSaving(false);
    if (!res.ok) {
      setItemError(json.error ?? "Error al guardar");
      return;
    }
    setItemModal(null);
    void load(true);
  }

  async function submitMovement(values: MovementFormValues) {
    if (!movementItem) return;
    setMovementSaving(true);
    setMovementError(null);
    const body: Record<string, unknown> = {
      item_id: movementItem.id,
      tipo: values.tipo,
      fecha: values.fecha,
      responsable: values.responsable || null,
      nota: values.nota || null,
      numero_pedido: values.numeroPedido || null
    };
    if (values.tipo === "ajuste") body.delta = Number(values.delta);
    else body.cantidad = Number(values.cantidad);

    const res = await authFetch("/api/erp/inventario/movimientos", { method: "POST", body: JSON.stringify(body) });
    const json = await res.json();
    setMovementSaving(false);
    if (!res.ok) {
      setMovementError(json.error ?? "Error al registrar");
      return;
    }
    setMovementItem(null);
    void load(true);
  }

  async function deleteItem(item: InventoryItem) {
    const warning = item.existencia !== 0
      ? `«${item.nombre}» todavía tiene ${item.existencia} en existencia. ¿Eliminarlo igual? Se oculta del inventario pero conserva su kardex.`
      : `¿Eliminar «${item.nombre}»? Se oculta del inventario pero conserva su kardex.`;
    if (!confirm(warning)) return;
    const res = await authFetch(`/api/erp/inventario/items/${item.id}`, { method: "DELETE" });
    if (res.ok) void load(true);
    else alert((await res.json()).error ?? "Error al eliminar");
  }

  return (
    <>
      <ChannelListPage
        title="Inventario"
        description="Maestro de productos — código, marca, responsable y existencia vigente."
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por código, producto o marca…"
        onRefresh={() => load()}
        refreshing={loading}
        filters={
          <div className={btnFilterGroup}>
            {FILTERS.map(({ id, label }) => {
              const count = id === "all" ? items.length : id === "bajo_minimo" ? lowStockCount : noStockCount;
              return (
                <button key={id} type="button" onClick={() => setFilter(id)} className={filter === id ? btnFilterActive : btnFilterIdle}>
                  {label} ({count})
                </button>
              );
            })}
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ExportMenu
              filename="inventario"
              sheetName="Inventario"
              columns={[
                { header: "Código", value: (i: InventoryItem) => i.codigo },
                { header: "Producto", value: (i: InventoryItem) => i.nombre },
                { header: "Marca", value: (i: InventoryItem) => i.marca ?? "" },
                { header: "Responsable", value: (i: InventoryItem) => i.responsable ?? "" },
                { header: "Stock mínimo", value: (i: InventoryItem) => i.stockMinimo ?? "" },
                { header: "Existencia", value: (i: InventoryItem) => i.existencia }
              ]}
              rows={sorted}
            />
            <Link href="/dashboard/erp/movimientos" className={btnGhost}>
              <ArrowLeftRight className="w-4 h-4" /> Movimientos
            </Link>
            {canManage && (
              <>
                <Link href="/dashboard/erp/inventario/reglas" className={btnGhost}>
                  <Settings className="w-4 h-4" />
                </Link>
                <button type="button" onClick={() => setImportOpen(true)} className={btnGhost}>
                  <Upload className="w-4 h-4" /> Importar
                </button>
              </>
            )}
            {canCreateItem && (
              <button type="button" onClick={() => setItemModal({})} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Nuevo producto
              </button>
            )}
          </div>
        }
        footer={
          filtered.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="productos"
            />
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <div className={registryTableEmpty}>
            {search.trim() || filter !== "all"
              ? "No hay productos con estos filtros."
              : canCreateItem
                ? "Aún no hay productos. Crea uno o importa el Excel de inventario."
                : "Aún no hay productos en el inventario."}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[900px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <SortableTh label="Código" sortKey="codigo" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Producto" sortKey="nombre" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Marca" sortKey="marca" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Responsable" sortKey="responsable" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Mínimo" sortKey="stock_minimo" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Existencia" sortKey="existencia" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(item => {
                const low = isLowStock(item);
                return (
                  <tr
                    key={item.id}
                    className={registryTableRowClickable}
                    onClick={() => router.push(`/dashboard/erp/inventario/${item.id}`)}
                  >
                    <td className={registryTableCellFirst}>
                      <span className="inline-flex items-center gap-2 text-sm font-mono text-gray-300">
                        <Package className="w-4 h-4 text-[#99c9ff] shrink-0" />
                        {item.codigo}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-sm font-medium text-white`}>{item.nombre}</td>
                    <td className={`${registryTableCell} text-sm text-gray-300`}>{item.marca || "—"}</td>
                    <td className={`${registryTableCell} text-sm text-gray-400`}>{item.responsable || "—"}</td>
                    <td className={`${registryTableCell} text-sm text-gray-400`}>{item.stockMinimo ?? "—"}</td>
                    <td className={registryTableCell}>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${low ? "text-amber-300" : "text-white"}`}>
                        {low && <AlertTriangle className="w-3.5 h-3.5" />}
                        {item.existencia}
                      </span>
                    </td>
                    <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                      <NoovaAnchoredMenu
                        open={openMenuId === item.id}
                        onClose={() => setOpenMenuId(null)}
                        menuClassName="min-w-[170px]"
                        anchor={
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setOpenMenuId(prev => (prev === item.id ? null : item.id)); }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        }
                      >
                        {canRegisterMovements && (
                          <NoovaListMenuItem onClick={() => { setOpenMenuId(null); setMovementItem(item); }}>
                            Registrar movimiento
                          </NoovaListMenuItem>
                        )}
                        <NoovaListMenuItem onClick={() => router.push(`/dashboard/erp/inventario/${item.id}`)}>
                          Ver kardex
                        </NoovaListMenuItem>
                        {canManage && (
                          <NoovaListMenuItem onClick={() => { setOpenMenuId(null); setItemModal({ item }); }}>
                            Editar
                          </NoovaListMenuItem>
                        )}
                        {canManage && (
                          <NoovaListMenuItem danger onClick={() => { setOpenMenuId(null); deleteItem(item); }}>
                            <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Eliminar</span>
                          </NoovaListMenuItem>
                        )}
                      </NoovaAnchoredMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <InventoryItemModal
        open={!!itemModal}
        item={itemModal?.item ?? null}
        saving={itemSaving}
        error={itemError}
        onClose={() => setItemModal(null)}
        onSubmit={submitItem}
      />
      <MovementModal
        open={!!movementItem}
        item={movementItem}
        canAdjust={canManage}
        saving={movementSaving}
        error={movementError}
        onClose={() => setMovementItem(null)}
        onSubmit={submitMovement}
      />
      <InventoryImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => load(true)} />
    </>
  );
}
