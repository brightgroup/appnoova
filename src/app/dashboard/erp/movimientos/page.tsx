"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, SlidersHorizontal, Trash2, Plus } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadRow,
  registryTableCellFirst,
  registryTableRowClickable,
  registryTableEmpty,
  btnFilterGroup,
  btnFilterActive,
  btnFilterIdle,
  btnPrimary
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { useSortableRows } from "@/hooks/useSortableRows";
import { SortableTh } from "@/components/ui/SortableTh";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import { MovementModal, movementTypeLabel, type MovementFormValues } from "@/components/erp/MovementModal";
import { ProductPickerModal } from "@/components/erp/ProductPickerModal";
import { formatMovementDateTime, type InventoryItem, type InventoryMovement, type InventoryMovementType } from "@/types/erp";

type Filter = "all" | InventoryMovementType;
type SortKey = "fecha" | "producto" | "tipo" | "cantidad" | "saldo" | "responsable" | "registrado_por";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "entrada", label: "Entradas" },
  { id: "salida", label: "Salidas" },
  { id: "ajuste", label: "Ajustes" },
  { id: "saldo_inicial", label: "Saldo inicial" }
];

function movementIcon(tipo: InventoryMovementType) {
  if (tipo === "entrada" || tipo === "saldo_inicial") return <ArrowDownCircle className="w-4 h-4 text-emerald-400" />;
  if (tipo === "salida") return <ArrowUpCircle className="w-4 h-4 text-amber-400" />;
  return <SlidersHorizontal className="w-4 h-4 text-[#99c9ff]" />;
}

export default function ErpMovimientosPage() {
  const router = useRouter();
  const { canWrite: canRegister } = useModuleWriteAccess("erp", "edit");
  const { canWrite: canManage } = useModuleWriteAccess("erp", "manage");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsById, setItemsById] = useState<Map<string, InventoryItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [movRes, itemsRes] = await Promise.all([
      authFetch("/api/erp/inventario/movimientos"),
      authFetch("/api/erp/inventario/items")
    ]);
    if (movRes.ok) {
      const json = await movRes.json();
      setMovements(json.movements ?? []);
    }
    if (itemsRes.ok) {
      const json = await itemsRes.json();
      const list: InventoryItem[] = json.items ?? [];
      setItems(list);
      setItemsById(new Map(list.map(i => [i.id, i])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function deleteMovement(id: string) {
    if (!confirm("¿Eliminar este movimiento? La existencia se ajusta automáticamente para revertirlo.")) return;
    const res = await authFetch(`/api/erp/inventario/movimientos/${id}`, { method: "DELETE" });
    if (res.ok) void load();
    else alert((await res.json()).error ?? "Error al eliminar");
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
      nota: values.nota || null
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
    void load();
  }

  const filtered = useMemo(() => {
    let list = movements;
    if (filter !== "all") list = list.filter(m => m.tipo === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(m => {
        const item = itemsById.get(m.itemId);
        return (
          item?.codigo.toLowerCase().includes(q) ||
          item?.nombre.toLowerCase().includes(q) ||
          m.responsable?.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [movements, filter, search, itemsById]);

  const getSortValue = useCallback(
    (m: InventoryMovement, key: SortKey): string | number | null => {
      const item = itemsById.get(m.itemId);
      switch (key) {
        case "fecha": return m.createdAt;
        case "producto": return item?.nombre ?? "";
        case "tipo": return movementTypeLabel(m.tipo);
        case "cantidad": return m.delta;
        case "saldo": return m.existenciaResultante;
        case "responsable": return m.responsable ?? "";
        case "registrado_por": return m.createdByLabel ?? "";
      }
    },
    [itemsById]
  );
  const { sort, toggleSort, sorted } = useSortableRows(filtered, getSortValue);

  const pagination = useRegistryPagination(sorted.length, `${search}-${filter}`);
  const pageRows = pagination.pageRows(sorted);

  return (
    <>
      <ChannelListPage
        title="Movimientos"
        description="Entradas, salidas y ajustes de todo el inventario, más recientes primero."
        backHref="/dashboard/erp/inventario"
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por producto, código o responsable…"
        onRefresh={() => load()}
        refreshing={loading}
        filters={
          <div className={btnFilterGroup}>
            {FILTERS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={filter === id ? btnFilterActive : btnFilterIdle}>
                {label}
              </button>
            ))}
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ExportMenu
              filename="movimientos-inventario"
              sheetName="Movimientos"
              columns={[
                { header: "Fecha", value: (m: InventoryMovement) => formatMovementDateTime(m) },
                { header: "Código", value: (m: InventoryMovement) => itemsById.get(m.itemId)?.codigo ?? "" },
                { header: "Producto", value: (m: InventoryMovement) => itemsById.get(m.itemId)?.nombre ?? "" },
                { header: "Tipo", value: (m: InventoryMovement) => movementTypeLabel(m.tipo) },
                { header: "Cantidad", value: (m: InventoryMovement) => m.delta },
                { header: "Saldo", value: (m: InventoryMovement) => m.existenciaResultante },
                { header: "Responsable", value: (m: InventoryMovement) => m.responsable ?? "" },
                { header: "Registrado por", value: (m: InventoryMovement) => m.createdByLabel ?? "" }
              ]}
              rows={sorted}
            />
            {canRegister && (
              <button type="button" onClick={() => setPickerOpen(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Registrar movimiento
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
              label="movimientos"
            />
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <div className={registryTableEmpty}>No hay movimientos con estos filtros.</div>
        ) : (
          <table className={`${registryTable} min-w-[1100px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <SortableTh label="Fecha" sortKey="fecha" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Producto" sortKey="producto" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Tipo" sortKey="tipo" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Cantidad" sortKey="cantidad" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Saldo" sortKey="saldo" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Responsable" sortKey="responsable" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Registrado por" sortKey="registrado_por" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                {canManage && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(m => {
                const item = itemsById.get(m.itemId);
                return (
                  <tr
                    key={m.id}
                    className={registryTableRowClickable}
                    onClick={() => item && router.push(`/dashboard/erp/inventario/${item.id}`)}
                  >
                    <td className={registryTableCellFirst}>{formatMovementDateTime(m)}</td>
                    <td className={registryTableCell}>
                      <div className="text-sm text-white">{item?.nombre ?? "—"}</div>
                      <div className="text-xs text-gray-500 font-mono">{item?.codigo ?? m.itemId}</div>
                    </td>
                    <td className={registryTableCell}>
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                        {movementIcon(m.tipo)} {movementTypeLabel(m.tipo)}
                      </span>
                    </td>
                    <td className={`${registryTableCell} font-mono ${m.delta > 0 ? "text-emerald-300" : "text-amber-300"}`}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </td>
                    <td className={`${registryTableCell} font-mono text-white`}>{m.existenciaResultante}</td>
                    <td className={`${registryTableCell} text-sm text-gray-400`}>{m.responsable || "—"}</td>
                    <td className={`${registryTableCell} text-sm text-gray-400`}>{m.createdByLabel || "—"}</td>
                    {canManage && (
                      <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => deleteMovement(m.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Eliminar movimiento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <ProductPickerModal
        open={pickerOpen}
        items={items}
        onClose={() => setPickerOpen(false)}
        onSelect={item => {
          setPickerOpen(false);
          setMovementItem(item);
        }}
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
    </>
  );
}
