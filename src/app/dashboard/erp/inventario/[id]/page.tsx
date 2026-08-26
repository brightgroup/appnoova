"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal, Pencil, Loader2, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnGhost,
  btnPrimary,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import { InventoryItemModal, type InventoryItemFormValues } from "@/components/erp/InventoryItemModal";
import { MovementModal, movementTypeLabel, type MovementFormValues } from "@/components/erp/MovementModal";
import { isLowStock, formatMovementDateTime, type InventoryItem, type InventoryMovement } from "@/types/erp";

function movementIcon(tipo: InventoryMovement["tipo"]) {
  if (tipo === "entrada" || tipo === "saldo_inicial") return <ArrowDownCircle className="w-4 h-4 text-emerald-400" />;
  if (tipo === "salida") return <ArrowUpCircle className="w-4 h-4 text-amber-400" />;
  return <SlidersHorizontal className="w-4 h-4 text-[#99c9ff]" />;
}

export default function ErpInventoryItemPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const itemId = params.id;
  const { canWrite: canRegisterMovements } = useModuleWriteAccess("erp", "edit");
  const { canWrite: canManage } = useModuleWriteAccess("erp", "manage");

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [movementOpen, setMovementOpen] = useState(false);
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await authFetch(`/api/erp/inventario/items/${itemId}/kardex`);
    if (res.status === 404) {
      setNotFound(true);
    } else if (res.ok) {
      const json = await res.json();
      setItem(json.item);
      setMovements(json.movements ?? []);
    }
    if (!silent) setLoading(false);
  }, [itemId]);

  useEffect(() => { void load(); }, [load]);

  const pagination = useRegistryPagination(movements.length, itemId);
  const pageRows = pagination.pageRows(movements);

  async function submitEdit(values: InventoryItemFormValues) {
    setEditSaving(true);
    setEditError(null);
    const res = await authFetch(`/api/erp/inventario/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        nombre: values.nombre,
        marca: values.marca || null,
        responsable: values.responsable || null,
        stock_minimo: values.stock_minimo === "" ? null : Number(values.stock_minimo)
      })
    });
    const json = await res.json();
    setEditSaving(false);
    if (!res.ok) {
      setEditError(json.error ?? "Error al guardar");
      return;
    }
    setEditOpen(false);
    void load(true);
  }

  async function submitMovement(values: MovementFormValues) {
    setMovementSaving(true);
    setMovementError(null);
    const body: Record<string, unknown> = {
      item_id: itemId,
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
    setMovementOpen(false);
    void load(true);
  }

  async function deleteMovement(movementId: string) {
    if (!confirm("¿Eliminar este movimiento? La existencia se ajusta automáticamente para revertirlo.")) return;
    const res = await authFetch(`/api/erp/inventario/movimientos/${movementId}`, { method: "DELETE" });
    if (res.ok) void load(true);
    else alert((await res.json()).error ?? "Error al eliminar");
  }

  async function deleteThisItem() {
    if (!item) return;
    const warning = item.existencia !== 0
      ? `«${item.nombre}» todavía tiene ${item.existencia} en existencia. ¿Eliminarlo igual? Se oculta del inventario pero conserva su kardex.`
      : `¿Eliminar «${item.nombre}»? Se oculta del inventario pero conserva su kardex.`;
    if (!confirm(warning)) return;
    const res = await authFetch(`/api/erp/inventario/items/${item.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/erp/inventario");
    else alert((await res.json()).error ?? "Error al eliminar");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Producto no encontrado.</div>
    );
  }

  const low = isLowStock(item);

  return (
    <>
      <ChannelListPage
        title={item.nombre}
        description={`${item.codigo}${item.marca ? ` · ${item.marca}` : ""}`}
        backHref="/dashboard/erp/inventario"
        loading={false}
        onRefresh={() => load()}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canManage && (
              <button type="button" onClick={() => setEditOpen(true)} className={btnGhost}>
                <Pencil className="w-4 h-4" /> Editar
              </button>
            )}
            {canManage && (
              <button type="button" onClick={deleteThisItem} className={`${btnGhost} text-red-300 hover:text-red-200`}>
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            )}
            {canRegisterMovements && (
              <button type="button" onClick={() => setMovementOpen(true)} className={btnPrimary}>
                Registrar movimiento
              </button>
            )}
          </div>
        }
        alerts={
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3">
              <p className="text-xs text-gray-500">Existencia</p>
              <p className={`text-2xl font-semibold mt-1 flex items-center gap-2 ${low ? "text-amber-300" : "text-white"}`}>
                {low && <AlertTriangle className="w-5 h-5" />} {item.existencia}
              </p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3">
              <p className="text-xs text-gray-500">Stock mínimo</p>
              <p className="text-2xl font-semibold mt-1 text-white">{item.stockMinimo ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3">
              <p className="text-xs text-gray-500">Responsable</p>
              <p className="text-2xl font-semibold mt-1 text-white truncate">{item.responsable || "—"}</p>
            </div>
          </div>
        }
        footer={
          movements.length > 0 ? (
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
        {movements.length === 0 ? (
          <div className={registryTableEmpty}>Sin movimientos todavía.</div>
        ) : (
          <table className={`${registryTable} min-w-[1050px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Fecha</th>
                <th className={registryTableHeadCell}>Tipo</th>
                <th className={registryTableHeadCell}>Cantidad</th>
                <th className={registryTableHeadCell}>Saldo</th>
                <th className={registryTableHeadCell}>Pedido</th>
                <th className={registryTableHeadCell}>Responsable</th>
                <th className={registryTableHeadCell}>Registrado por</th>
                <th className={registryTableHeadCell}>Nota</th>
                {canManage && <th className={`${registryTableHeadCell} w-10`} />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(m => (
                <tr key={m.id}>
                  <td className={registryTableCellFirst}>{formatMovementDateTime(m)}</td>
                  <td className={registryTableCell}>
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                      {movementIcon(m.tipo)} {movementTypeLabel(m.tipo)}
                    </span>
                  </td>
                  <td className={`${registryTableCell} font-mono ${m.delta > 0 ? "text-emerald-300" : "text-amber-300"}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td className={`${registryTableCell} font-mono text-white`}>{m.existenciaResultante}</td>
                  <td className={`${registryTableCell} text-sm text-gray-400 font-mono`}>{m.numeroPedido || "—"}</td>
                  <td className={`${registryTableCell} text-sm text-gray-400`}>{m.responsable || "—"}</td>
                  <td className={`${registryTableCell} text-sm text-gray-400`}>{m.createdByLabel || "—"}</td>
                  <td className={`${registryTableCell} text-sm text-gray-500`}>{m.nota || "—"}</td>
                  {canManage && (
                    <td className={registryTableCell}>
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
              ))}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <InventoryItemModal
        open={editOpen}
        item={item}
        saving={editSaving}
        error={editError}
        onClose={() => setEditOpen(false)}
        onSubmit={submitEdit}
      />
      <MovementModal
        open={movementOpen}
        item={item}
        canAdjust={canManage}
        saving={movementSaving}
        error={movementError}
        onClose={() => setMovementOpen(false)}
        onSubmit={submitMovement}
      />
    </>
  );
}
