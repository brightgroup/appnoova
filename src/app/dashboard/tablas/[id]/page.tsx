"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Upload, Plus, Trash2, Loader2, Bot, Database, MoreHorizontal, Pencil
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { DataTableImportDialog } from "@/components/data-tables/DataTableImportDialog";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import {
  registryPage, registryToolbar, btnPrimary, btnGhost, textMuted,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableEmpty,
} from "@/lib/brand-ui";
import type { DataTableColumn, DataTableRecord, DataTableRowRecord } from "@/types/data-table";

function formatCell(value: unknown, col: DataTableColumn): string {
  if (value == null || value === "") return "—";
  if (col.type === "number" && typeof value === "number") {
    const l = col.label.toLowerCase();
    if (l.includes("precio") || l.includes("costo")) {
      return "$" + new Intl.NumberFormat("es-CO").format(Math.round(value));
    }
    return new Intl.NumberFormat("es-CO").format(value);
  }
  return String(value);
}

export default function TablaDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [table, setTable] = useState<DataTableRecord | null>(null);
  const [rows, setRows] = useState<DataTableRowRecord[]>([]);
  const [linkedAgents, setLinkedAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editRow, setEditRow] = useState<DataTableRowRecord | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch(`/api/data-tables/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Error al cargar");
      setLoading(false);
      return;
    }
    setTable(json.table);
    setRows(json.rows ?? []);
    setLinkedAgents(json.linked_agents ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const columns = table?.columns ?? [];
  const displayCols = columns.filter(c => c.display);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      columns.some(c => String(r.data[c.key] ?? "").toLowerCase().includes(q))
    );
  }, [rows, columns, search]);

  const pagination = useRegistryPagination(filteredRows.length, search, { defaultPageSize: 100 });
  const pageRows = pagination.pageRows(filteredRows);

  const openEdit = (row: DataTableRowRecord) => {
    setEditRow(row);
    const draft: Record<string, string> = {};
    for (const c of columns) {
      draft[c.key] = row.data[c.key] != null ? String(row.data[c.key]) : "";
    }
    setEditDraft(draft);
  };

  const openNew = () => {
    setEditRow({
      id: "", data_table_id: id, organization_id: "", data: {},
      sort_order: rows.length, is_active: true, created_at: "", updated_at: "",
    });
    const draft: Record<string, string> = {};
    for (const c of columns) draft[c.key] = "";
    setEditDraft(draft);
  };

  const saveRow = async () => {
    if (!table) return;
    setSaving(true);
    const data: Record<string, string | number | null> = {};
    for (const c of columns) {
      const raw = editDraft[c.key] ?? "";
      if (c.type === "number") {
        const n = Number(String(raw).replace(/[^\d.-]/g, ""));
        data[c.key] = raw.trim() === "" ? null : (Number.isFinite(n) ? n : null);
      } else {
        data[c.key] = raw.trim() || null;
      }
    }

    const isNew = !editRow?.id;
    const res = await authFetch(`/api/data-tables/${id}/rows`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? { data } : { row_id: editRow?.id, data }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar fila");
      return;
    }
    setEditRow(null);
    await load();
  };

  const deleteRow = async (rowId: string) => {
    if (!confirm("¿Eliminar esta fila?")) return;
    setOpenMenuId(null);
    const res = await authFetch(`/api/data-tables/${id}/rows?row_id=${rowId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Error al eliminar");
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#5b5bf6]" /> Cargando…
      </div>
    );
  }

  if (!table) {
    return (
      <div className="p-8 text-center text-gray-400">
        Tabla no encontrada.{" "}
        <Link href="/dashboard/tablas" className="text-[#a5a5ff] hover:underline">Volver</Link>
      </div>
    );
  }

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/tablas" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Database className="w-4 h-4 text-[#5b5bf6] shrink-0" />
              <h1 className="text-xl font-bold tracking-tight truncate">{table.name}</h1>
              <span className="text-xs text-gray-500">
                {table.row_count.toLocaleString("es-CO")} filas · {columns.length} columnas
              </span>
            </div>
            {linkedAgents.length > 0 && (
              <p className={`text-xs ${textMuted} mt-0.5 flex items-center gap-1`}>
                <Bot className="w-3 h-3 shrink-0" />
                Agente{linkedAgents.length > 1 ? "s" : ""}: {linkedAgents.map(a => a.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-1.5 mb-4">
          {columns.map(c => (
            <span
              key={c.key}
              className="text-[10px] px-2 py-1 rounded-full border border-white/[.08] bg-white/[.03] text-gray-400"
            >
              {c.label}
              {c.filterable && <span className="text-[#a5a5ff] ml-1">filtro</span>}
            </span>
          ))}
        </div>

        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar en la tabla…"
          onRefresh={load}
          refreshing={loading}
          error={error || undefined}
          action={
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setImportOpen(true)} className={btnGhost}>
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Reimportar</span>
              </button>
              <button type="button" onClick={openNew} className={`${btnPrimary} gap-2`}>
                <Plus className="w-4 h-4" /> Fila
              </button>
            </div>
          }
          footer={
            filteredRows.length > 0 ? (
              <RegistryTablePagination
                total={pagination.total}
                rangeStart={pagination.rangeStart}
                rangeEnd={pagination.rangeEnd}
                pageSafe={pagination.pageSafe}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                label="registros"
              />
            ) : undefined
          }
        >
          {filteredRows.length === 0 ? (
            <div className={registryTableEmpty}>
              {search.trim()
                ? "No hay registros con esa búsqueda."
                : "Esta tabla no tiene filas. Agrega una manualmente o reimporta un Excel."}
            </div>
          ) : (
            <table className={`${registryTable} min-w-max`}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  {displayCols.map(c => (
                    <th key={c.key} className={registryTableHeadCell}>{c.label}</th>
                  ))}
                  <th className={`${registryTableHeadCell} w-12`} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => (
                  <tr key={row.id} className={registryTableRow}>
                    {displayCols.map(c => (
                      <td
                        key={c.key}
                        className={`${registryTableCell} text-sm text-gray-200 whitespace-nowrap max-w-[240px] truncate`}
                        title={formatCell(row.data[c.key], c)}
                      >
                        {formatCell(row.data[c.key], c)}
                      </td>
                    ))}
                    <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                      <NoovaAnchoredMenu
                        open={openMenuId === row.id}
                        onClose={() => setOpenMenuId(null)}
                        menuClassName="min-w-[120px]"
                        anchor={
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setOpenMenuId(prev => (prev === row.id ? null : row.id));
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        }
                      >
                        <NoovaListMenuItem onClick={() => { setOpenMenuId(null); openEdit(row); }}>
                          <span className="flex items-center gap-2">
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </span>
                        </NoovaListMenuItem>
                        <NoovaListMenuItem danger onClick={() => void deleteRow(row.id)}>
                          <span className="flex items-center gap-2">
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </span>
                        </NoovaListMenuItem>
                      </NoovaAnchoredMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>

        <p className={`text-xs ${textMuted} mt-4`}>
          Asigna esta tabla en la configuración de tu agente de texto. El agente usará estos datos como fuente autorizada de precios y productos.
        </p>
      </div>

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditRow(null)}>
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-white/[.12] bg-[#12131a] p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold">{editRow.id ? "Editar fila" : "Nueva fila"}</h3>
            {columns.map(c => (
              <div key={c.key}>
                <label className="block text-xs text-gray-400 mb-1">{c.label}</label>
                <input
                  type="text"
                  value={editDraft[c.key] ?? ""}
                  onChange={e => setEditDraft(d => ({ ...d, [c.key]: e.target.value }))}
                  className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-[#12131a]">
              <button type="button" onClick={() => setEditRow(null)} className={btnGhost}>Cancelar</button>
              <button type="button" onClick={saveRow} disabled={saving} className={`${btnPrimary} gap-2`}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <DataTableImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        tableId={id}
        title="Reimportar Excel"
        onImported={() => { setImportOpen(false); void load(); }}
      />
    </div>
  );
}
