"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Upload, Plus, Trash2, Loader2, Bot, Database, MoreHorizontal,
  Download, FileSpreadsheet
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { parseCellValue } from "@/lib/data-tables/columns";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { DataTableImportDialog } from "@/components/data-tables/DataTableImportDialog";
import { exportDataTableCsv, exportDataTableXlsx } from "@/lib/data-tables/export";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import {
  registryPage, registryToolbar, registryContent, btnPrimary, btnGhost, textMuted,
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

const DATA_COL_WIDTH_PX = 140;
const ACTIONS_COL_WIDTH_PX = 40;

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
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
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

  const openNew = () => {
    setEditingCell(null);
    setEditRow({
      id: "", data_table_id: id, organization_id: "", data: {},
      sort_order: rows.length, is_active: true, created_at: "", updated_at: "",
    });
    const draft: Record<string, string> = {};
    for (const c of columns) draft[c.key] = "";
    setEditDraft(draft);
  };

  const startCellEdit = (row: DataTableRowRecord, col: DataTableColumn) => {
    setEditingCell({ rowId: row.id, colKey: col.key });
    setEditValue(row.data[col.key] != null ? String(row.data[col.key]) : "");
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveCell = async (row: DataTableRowRecord, col: DataTableColumn) => {
    const cellKey = `${row.id}:${col.key}`;
    const parsed = parseCellValue(editValue, col);
    const current = row.data[col.key];
    const unchanged =
      parsed === current ||
      (parsed == null && (current == null || current === ""));

    if (unchanged) {
      cancelCellEdit();
      return;
    }

    setSavingCell(cellKey);
    const data = { ...row.data, [col.key]: parsed };
    const res = await authFetch(`/api/data-tables/${id}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row_id: row.id, data }),
    });
    const json = await res.json();
    setSavingCell(null);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar celda");
      return;
    }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, data } : r)));
    cancelCellEdit();
  };

  const saveRow = async () => {
    if (!table) return;
    setSaving(true);
    const data: Record<string, string | number | null> = {};
    for (const c of columns) {
      data[c.key] = parseCellValue(editDraft[c.key] ?? "", c) as string | number | null;
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
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#0f7eff]" /> Cargando…
      </div>
    );
  }

  if (!table) {
    return (
      <div className="p-8 text-center text-gray-400">
        Tabla no encontrada.{" "}
        <Link href="/dashboard/tablas" className="text-[#99c9ff] hover:underline">Volver</Link>
      </div>
    );
  }

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/dashboard/tablas" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Database className="w-4 h-4 text-[#0f7eff] shrink-0" />
              <h1 className="text-xl font-bold tracking-tight truncate">{table.name}</h1>
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

      <div className={`${registryContent} flex flex-col min-h-0 overflow-hidden`}>
        <div className="flex-1 flex flex-col min-h-0">
        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar en la tabla…"
          onRefresh={load}
          refreshing={loading}
          error={error || undefined}
          action={
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {rows.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => exportDataTableCsv(table.name, columns, filteredRows)}
                    className={btnGhost}
                    title="Descargar CSV"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportDataTableXlsx(table.name, columns, filteredRows)}
                    className={btnGhost}
                    title="Descargar Excel"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                </>
              )}
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
            <table
              className={`${registryTable} table-fixed`}
              style={{ width: displayCols.length * DATA_COL_WIDTH_PX + ACTIONS_COL_WIDTH_PX }}
            >
              <colgroup>
                {displayCols.map(c => (
                  <col key={c.key} style={{ width: DATA_COL_WIDTH_PX }} />
                ))}
                <col style={{ width: ACTIONS_COL_WIDTH_PX }} />
              </colgroup>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  {displayCols.map(c => (
                    <th
                      key={c.key}
                      title={c.label}
                      className={`${registryTableHeadCell} !px-2 !py-1.5 max-w-0 overflow-hidden`}
                    >
                      <span className="block truncate">{c.label}</span>
                    </th>
                  ))}
                  <th className={`${registryTableHeadCell} !px-1 !py-1.5 w-10`} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => (
                  <tr key={row.id} className={registryTableRow}>
                    {displayCols.map(c => {
                      const isEditing = editingCell?.rowId === row.id && editingCell.colKey === c.key;
                      const cellKey = `${row.id}:${c.key}`;
                      const isSaving = savingCell === cellKey;
                      const display = formatCell(row.data[c.key], c);

                      return (
                        <td
                          key={c.key}
                          className={`${registryTableCellFirst} !px-0 !py-0 text-xs text-gray-200 max-w-0 overflow-hidden`}
                          title={!isEditing ? display : undefined}
                          onClick={() => {
                            if (!isEditing) startCellEdit(row, c);
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              disabled={isSaving}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => void saveCell(row, c)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveCell(row, c);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelCellEdit();
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              className="w-full min-w-0 max-w-full box-border bg-[#1a1b24] border border-[#0f7eff]/50 px-2 py-1 text-xs text-white outline-none focus:border-[#0f7eff]"
                            />
                          ) : (
                            <span className="block px-2 py-1 truncate cursor-text hover:bg-white/[.04]">
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin text-[#0f7eff] inline" />
                              ) : (
                                display
                              )}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`${registryTableCell} !px-0 !py-0`}>
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
                            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        }
                      >
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
        </div>

        <p className={`text-xs ${textMuted} mt-4 shrink-0`}>
          Clic en cualquier celda para editarla (como Excel). Enter guarda, Escape cancela. El agente solo usa los datos de esta tabla.
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
