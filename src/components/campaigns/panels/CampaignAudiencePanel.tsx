"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Check, X, Columns3, Users, Upload } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { formatScheduledCol } from "@/lib/format-datetime";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ExportColumn } from "@/lib/export-table";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { CampaignMappingFields } from "@/components/campaigns/CampaignMappingFields";
import {
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRow,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty,
  tabActive,
  tabIdle,
} from "@/lib/brand-ui";
import {
  CAMPAIGN_CALL_STATUS_COLORS,
  CAMPAIGN_CALL_STATUS_LABELS,
  type CampaignAudienceRowRecord,
  type VoiceCampaignRecord,
} from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

interface CampaignAudiencePanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

type CellValue = string | number | boolean | null;
type AudienceSubTab = "contactos" | "mapeo";
type EditField = string | "__contact_name__" | "__phone_e164__";

function StatusBadge({ status }: { status: CampaignAudienceRowRecord["call_status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAMPAIGN_CALL_STATUS_COLORS[status]}`}
    >
      {CAMPAIGN_CALL_STATUS_LABELS[status]}
    </span>
  );
}

export function CampaignAudiencePanel({ campaign, onChange }: CampaignAudiencePanelProps) {
  const [subTab, setSubTab] = useState<AudienceSubTab>("contactos");
  const [columns, setColumns] = useState<DataTableColumn[]>([]);
  const [rows, setRows] = useState<CampaignAudienceRowRecord[]>([]);
  const [tableName, setTableName] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ rowId: string; key: EditField } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const res = await authFetch(`/api/campaigns/${campaign.id}/audience-rows`);
    if (!opts?.silent) setLoading(false);
    if (!res.ok) return;
    const json = await res.json();
    setColumns(json.table?.columns ?? []);
    setTableName(json.table?.name ?? "");
    setRows(json.rows ?? []);
  }, [campaign.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (campaign.status !== "active") return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load();
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [campaign.status, load]);

  const displayCols = useMemo(
    () => columns.filter(c => c.display !== false),
    [columns]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      if ((r.contact_name ?? "").toLowerCase().includes(q)) return true;
      if ((r.phone_e164 ?? "").includes(q)) return true;
      if (CAMPAIGN_CALL_STATUS_LABELS[r.call_status].toLowerCase().includes(q)) return true;
      return columns.some(c => String(r.data[c.key] ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, columns]);

  const pagination = useRegistryPagination(filtered.length, search, { defaultPageSize: 50 });
  const pageRows = pagination.pageRows(filtered);

  const exportColumns = useMemo<ExportColumn<CampaignAudienceRowRecord>[]>(
    () => [
      { header: "Contacto", value: r => r.contact_name ?? "" },
      { header: "Teléfono", value: r => r.phone_e164 ?? "" },
      { header: "Resultado", value: r => CAMPAIGN_CALL_STATUS_LABELS[r.call_status] },
      { header: "Intentos", value: r => r.total_attempts },
      { header: "Próxima llamada", value: r => formatScheduledCol(r.scheduled_call_at) },
      ...columns
        .filter(c => c.display !== false)
        .map<ExportColumn<CampaignAudienceRowRecord>>(c => ({
          header: c.label,
          value: r => {
            const v = r.data[c.key];
            return v == null ? "" : String(v);
          },
        })),
    ],
    [columns]
  );

  const stats = useMemo(() => {
    const counts = {
      pending: 0,
      calling: 0,
      retry: 0,
      connected: 0,
      voicemail: 0,
      no_answer: 0,
      busy: 0,
      rejected: 0,
      failed: 0,
    };
    for (const r of rows) {
      const key = r.call_status as keyof typeof counts;
      if (key in counts) counts[key] += 1;
    }
    return counts;
  }, [rows]);

  const startEdit = (rowId: string, key: EditField, current: CellValue | string | null | undefined) => {
    setEditing({ rowId, key });
    setDraft(current == null ? "" : String(current));
  };

  const commitEdit = async () => {
    if (!editing) return;
    const row = rows.find(r => r.id === editing.rowId);
    if (!row) {
      setEditing(null);
      return;
    }

    setBusy(true);
    let body: Record<string, unknown> = { row_id: editing.rowId };

    if (editing.key === "__contact_name__") {
      body = { row_id: editing.rowId, contact_name: draft.trim() || null };
    } else if (editing.key === "__phone_e164__") {
      body = { row_id: editing.rowId, phone_e164: draft.trim() || null };
    } else {
      const nextData = { ...row.data, [editing.key]: draft === "" ? null : draft };
      body = { row_id: editing.rowId, data: nextData };
    }

    const res = await authFetch(`/api/campaigns/${campaign.id}/audience-rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    setEditing(null);
    if (res.ok && json.row) {
      setRows(prev => prev.map(r => (r.id === json.row.id ? json.row : r)));
    }
  };

  const deleteRow = async (rowId: string) => {
    setBusy(true);
    const res = await authFetch(
      `/api/campaigns/${campaign.id}/audience-rows?row_id=${rowId}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (res.ok) setRows(prev => prev.filter(r => r.id !== rowId));
  };

  const addRow = async () => {
    const name = window.prompt("Nombre del contacto (opcional)") ?? "";
    const phone = window.prompt("Teléfono (requerido para marcar)") ?? "";
    if (!phone.trim()) return;

    setBusy(true);
    const empty: Record<string, CellValue> = {};
    for (const c of columns) empty[c.key] = null;
    const res = await authFetch(`/api/campaigns/${campaign.id}/audience-rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: empty,
        contact_name: name.trim() || null,
        phone_e164: phone.trim(),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok && json.row) setRows(prev => [...prev, json.row]);
  };

  const replaceAudience = async (file: File) => {
    if (campaign.status === "active") {
      window.alert("Pausa la campaña antes de reemplazar la audiencia.");
      return;
    }
    if (
      !window.confirm(
        "¿Reemplazar toda la base de contactos? Se borrarán los registros actuales y se cargará el Excel nuevo."
      )
    ) {
      return;
    }

    setImportBusy(true);
    const form = new FormData();
    form.append("file", file);
    form.append("replace", "true");
    form.append("name", tableName || file.name.replace(/\.[^.]+$/, ""));

    const res = await authFetch(`/api/campaigns/${campaign.id}/audience`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setImportBusy(false);
    if (!res.ok) {
      window.alert(json.error ?? "No se pudo importar la nueva base");
      return;
    }
    onChange({
      audience_table_id: json.audience_table_id,
      field_mapping: json.auto_map ?? campaign.field_mapping,
    });
    await load();
  };

  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16 text-sm text-gray-500">
        Esta campaña aún no tiene audiencia importada.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="border-b border-white/[.08] px-6 shrink-0">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSubTab("contactos")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
              subTab === "contactos" ? tabActive : tabIdle
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Contactos
          </button>
          <button
            type="button"
            onClick={() => setSubTab("mapeo")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
              subTab === "mapeo" ? tabActive : tabIdle
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" /> Mapeo y variables
          </button>
        </div>
      </div>

      {subTab === "mapeo" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <p className="text-xs text-gray-500 mb-4">
              Asocia las columnas del archivo a los campos de Noova y define las variables del guion.
            </p>
            <CampaignMappingFields
              campaignId={campaign.id}
              mapping={campaign.field_mapping}
              columns={columns}
              triggerNeedsDate={campaign.trigger_rule.type === "excel_date"}
              onChange={field_mapping => onChange({ field_mapping })}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-white">{tableName}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {rows.length} contactos · actualiza cada 10 s con la campaña activa
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              {stats.pending > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-gray-500/10 text-gray-300 border-gray-500/20">
                  {stats.pending} pendientes
                </span>
              )}
              {stats.calling > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-sky-500/10 text-sky-300 border-sky-500/20">
                  {stats.calling} marcando
                </span>
              )}
              {stats.connected > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                  {stats.connected} conectados
                </span>
              )}
              {stats.voicemail > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-violet-500/10 text-violet-300 border-violet-500/20">
                  {stats.voicemail} buzón
                </span>
              )}
              {stats.no_answer > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-orange-500/10 text-orange-300 border-orange-500/20">
                  {stats.no_answer} no contestó
                </span>
              )}
              {stats.rejected > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-rose-500/10 text-rose-300 border-rose-500/20">
                  {stats.rejected} rechazadas
                </span>
              )}
              {stats.failed > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-red-500/10 text-red-300 border-red-500/20">
                  {stats.failed} error
                </span>
              )}
              {stats.retry > 0 && (
                <span className="rounded-full border px-2 py-0.5 bg-amber-500/10 text-amber-300 border-amber-500/20">
                  {stats.retry} reintento
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void replaceAudience(file);
                }}
              />
              {campaign.status !== "active" && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-white hover:bg-white/[.08] disabled:opacity-50"
                >
                  {importBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Reemplazar base
                </button>
              )}
              <ExportMenu
                filename="audiencia"
                sheetName="Audiencia"
                columns={exportColumns}
                rows={filtered}
              />
              <button
                type="button"
                onClick={() => void addRow()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-white hover:bg-white/[.08] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <RegistryTableLayout
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por nombre, teléfono o estado…"
              onRefresh={() => void load()}
              refreshing={loading}
              footer={
                <RegistryTablePagination
                  total={pagination.total}
                  rangeStart={pagination.rangeStart}
                  rangeEnd={pagination.rangeEnd}
                  pageSafe={pagination.pageSafe}
                  totalPages={pagination.totalPages}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              }
            >
              <table className={`${registryTable} min-w-max w-full`}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Contacto</th>
                    <th className={registryTableHeadCell}>Teléfono</th>
                    <th className={registryTableHeadCell}>Resultado</th>
                    <th className={registryTableHeadCell}>Intentos</th>
                    <th className={registryTableHeadCell}>Próxima llamada</th>
                    {displayCols.map(c => (
                      <th key={c.key} className={registryTableHeadCell}>
                        {c.label}
                      </th>
                    ))}
                    <th className={`${registryTableHeadCell} text-right`} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={displayCols.length + 6} className={registryTableEmpty}>
                        Sin resultados
                      </td>
                    </tr>
                  ) : (
                    pageRows.map(row => (
                      <tr key={row.id} className={registryTableRow}>
                        <td className={registryTableCellFirst}>
                          {editing?.rowId === row.id && editing.key === "__contact_name__" ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") void commitEdit();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="w-full min-w-[100px] rounded-md border border-[#5b5bf6]/40 bg-white/[.06] px-2 py-1 text-xs text-white focus:outline-none"
                              />
                              <button type="button" onClick={() => void commitEdit()} disabled={busy} className="p-1 text-emerald-400">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className="p-1 text-gray-400">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(row.id, "__contact_name__", row.contact_name)}
                              className="w-full text-left text-white hover:text-[#5b5bf6] text-sm"
                            >
                              {row.contact_name?.trim() || "—"}
                            </button>
                          )}
                        </td>
                        <td className={`${registryTableCell} font-mono text-[11px] text-gray-200`}>
                          {editing?.rowId === row.id && editing.key === "__phone_e164__" ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") void commitEdit();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="w-full min-w-[120px] rounded-md border border-[#5b5bf6]/40 bg-white/[.06] px-2 py-1 text-xs text-white focus:outline-none"
                              />
                              <button type="button" onClick={() => void commitEdit()} disabled={busy} className="p-1 text-emerald-400">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className="p-1 text-gray-400">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(row.id, "__phone_e164__", row.phone_e164)}
                              className="w-full text-left hover:text-[#5b5bf6]"
                            >
                              {row.phone_e164 || "—"}
                            </button>
                          )}
                        </td>
                        <td className={registryTableCell}>
                          <StatusBadge status={row.call_status} />
                        </td>
                        <td className={`${registryTableCell} tabular-nums text-center`}>
                          {row.total_attempts}
                        </td>
                        <td className={`${registryTableCell} text-xs text-gray-400 whitespace-nowrap`}>
                          {formatScheduledCol(row.scheduled_call_at)}
                        </td>
                        {displayCols.map(c => {
                          const isEditing =
                            editing?.rowId === row.id && editing?.key === c.key;
                          const cls = registryTableCell;
                          return (
                            <td key={c.key} className={cls}>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    autoFocus
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") void commitEdit();
                                      if (e.key === "Escape") setEditing(null);
                                    }}
                                    className="w-full min-w-[100px] rounded-md border border-[#5b5bf6]/40 bg-white/[.06] px-2 py-1 text-xs text-white focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void commitEdit()}
                                    disabled={busy}
                                    className="p-1 text-emerald-400 hover:text-emerald-300"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditing(null)}
                                    className="p-1 text-gray-400 hover:text-white"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(row.id, c.key, row.data[c.key])}
                                  className="w-full text-left text-gray-400 hover:text-white text-xs"
                                >
                                  {row.data[c.key] == null || row.data[c.key] === ""
                                    ? "—"
                                    : String(row.data[c.key])}
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td className={`${registryTableCell} text-right`}>
                          <button
                            type="button"
                            onClick={() => void deleteRow(row.id)}
                            disabled={busy}
                            className="p-1.5 text-gray-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </RegistryTableLayout>
          )}
        </div>
      )}
    </div>
  );
}
