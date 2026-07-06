"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Phone, X } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { formatDatetimeCol } from "@/lib/format-datetime";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import {
  modalOverlay,
  registryTable,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  registryTableRowClickable,
} from "@/lib/brand-ui";
import type { ExportColumn } from "@/lib/export-table";
import {
  CAMPAIGN_CALL_STATUS_COLORS,
  CAMPAIGN_CALL_STATUS_LABELS,
  type CampaignCallStatus,
  type CampaignOutputField,
  type VoiceCampaignRecord,
} from "@/types/voice-campaign";

type CellValue = string | number | boolean | null;

interface ResultRow {
  id: string;
  contact_name: string | null;
  phone_e164: string | null;
  call_status: CampaignCallStatus;
  total_attempts: number;
  last_attempt_at: string | null;
  results: Record<string, CellValue> | null;
  results_meta: Record<string, { pending_review?: boolean; raw?: string } | undefined> | null;
  result_primary: string | null;
  excluded_reason: string | null;
  crm_contact_id: string | null;
  crm_lead_id: string | null;
}

interface ProspectCall {
  id: string;
  created_at: string;
  duration_sec: number;
  status: string;
  status_label: string | null;
  in_voicemail: boolean;
  summary: string | null;
  transcript: { role: string; text: string }[] | null;
  audio_url: string | null;
  extracted_data: Record<string, unknown> | null;
}

function formatValue(v: CellValue | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CampaignResultsPanel({ campaign }: { campaign: VoiceCampaignRecord }) {
  const [fields, setFields] = useState<CampaignOutputField[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ResultRow | null>(null);
  const [calls, setCalls] = useState<ProspectCall[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/campaigns/${campaign.id}/results`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return;
    setFields(json.output_fields ?? []);
    setRows(json.rows ?? []);
  }, [campaign.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: ResultRow) => {
    setDetail(row);
    setCalls(null);
    const res = await authFetch(`/api/campaigns/${campaign.id}/results?row_id=${row.id}`);
    const json = await res.json().catch(() => ({}));
    setCalls(res.ok ? (json.calls ?? []) : []);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        (r.contact_name ?? "").toLowerCase().includes(q) ||
        (r.phone_e164 ?? "").includes(q) ||
        (r.result_primary ?? "").toLowerCase().includes(q) ||
        CAMPAIGN_CALL_STATUS_LABELS[r.call_status].toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pagination = useRegistryPagination(filtered.length, search, { defaultPageSize: 50 });
  const pageRows = pagination.pageRows(filtered);

  const exportColumns = useMemo<ExportColumn<ResultRow>[]>(
    () => [
      { header: "Nombre", value: r => r.contact_name ?? "" },
      { header: "Teléfono", value: r => r.phone_e164 ?? "" },
      { header: "Estado en la campaña", value: r => CAMPAIGN_CALL_STATUS_LABELS[r.call_status] },
      { header: "Intentos", value: r => r.total_attempts },
      { header: "Última llamada", value: r => (r.last_attempt_at ? formatDatetimeCol(r.last_attempt_at) : "") },
      { header: "Tipificación", value: r => r.result_primary ?? "" },
      ...fields
        .filter(f => !f.is_primary)
        .map<ExportColumn<ResultRow>>(f => ({
          header: f.label,
          value: r => formatValue(r.results?.[f.key]).replace(/^—$/, ""),
        })),
    ],
    [fields]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando resultados…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16 text-sm text-gray-500">
        Aún no hay prospectos inscritos en esta campaña.
      </div>
    );
  }

  const nonPrimaryFields = fields.filter(f => !f.is_primary);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 py-4">
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Resultados</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} prospectos · haz clic en uno para ver el detalle de sus llamadas
          </p>
        </div>
        <ExportMenu
          filename={`resultados-${campaign.name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`}
          sheetName="Resultados"
          columns={exportColumns}
          rows={filtered}
        />
      </div>

      <RegistryTableLayout
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre, teléfono o tipificación…"
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
              <th className={registryTableHeadCell}>Nombre</th>
              <th className={registryTableHeadCell}>Teléfono</th>
              <th className={registryTableHeadCell}>Estado</th>
              <th className={registryTableHeadCell}>Intentos</th>
              <th className={registryTableHeadCell}>Última llamada</th>
              {fields.some(f => f.is_primary) && (
                <th className={registryTableHeadCell}>Tipificación</th>
              )}
              {nonPrimaryFields.map(f => (
                <th key={f.key} className={registryTableHeadCell}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6 + nonPrimaryFields.length} className={registryTableEmpty}>
                  Sin resultados
                </td>
              </tr>
            ) : (
              pageRows.map(row => (
                <tr
                  key={row.id}
                  className={registryTableRowClickable}
                  onClick={() => void openDetail(row)}
                >
                  <td className={registryTableCellFirst}>{row.contact_name?.trim() || "—"}</td>
                  <td className={`${registryTableCell} font-mono text-[11px] text-gray-200`}>
                    {row.phone_e164 || "—"}
                  </td>
                  <td className={registryTableCell}>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAMPAIGN_CALL_STATUS_COLORS[row.call_status]}`}
                    >
                      {row.excluded_reason === "no_contactar"
                        ? "No contactar"
                        : CAMPAIGN_CALL_STATUS_LABELS[row.call_status]}
                    </span>
                  </td>
                  <td className={`${registryTableCell} tabular-nums text-center`}>
                    {row.total_attempts}
                  </td>
                  <td className={`${registryTableCell} text-xs text-gray-400 whitespace-nowrap`}>
                    {row.last_attempt_at ? formatDatetimeCol(row.last_attempt_at) : "—"}
                  </td>
                  {fields.some(f => f.is_primary) && (
                    <td className={registryTableCell}>
                      {row.result_primary ? (
                        <span className="inline-flex items-center rounded-full border border-[#5b5bf6]/30 bg-[#5b5bf6]/10 px-2 py-0.5 text-[10px] font-medium text-[#c8c8ff]">
                          {row.result_primary}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {nonPrimaryFields.map(f => {
                    const pending = row.results_meta?.[f.key]?.pending_review;
                    return (
                      <td key={f.key} className={`${registryTableCell} text-xs text-gray-300`}>
                        {pending ? (
                          <span
                            className="inline-flex items-center gap-1 text-amber-300"
                            title={`Respuesta fuera de opciones: "${row.results_meta?.[f.key]?.raw ?? ""}"`}
                          >
                            <AlertTriangle className="w-3 h-3" /> Por revisar
                          </span>
                        ) : (
                          formatValue(row.results?.[f.key])
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RegistryTableLayout>

      {detail && (
        <div className={modalOverlay} onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-white/[.12] bg-[#12131a] shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08] shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {detail.contact_name || detail.phone_e164 || "Prospecto"}
                </h3>
                <p className="text-[11px] text-gray-500 font-mono">{detail.phone_e164}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/[.08]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {fields.length > 0 && (
                <div className="rounded-lg border border-white/[.08] bg-white/[.02] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
                    Información capturada
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {fields.map(f => (
                      <div key={f.key} className="min-w-0">
                        <dt className="text-[11px] text-gray-500">{f.label}</dt>
                        <dd className="text-sm text-white truncate">
                          {detail.results_meta?.[f.key]?.pending_review ? (
                            <span className="text-amber-300 text-xs">
                              Por revisar: &ldquo;{detail.results_meta?.[f.key]?.raw}&rdquo;
                            </span>
                          ) : (
                            formatValue(detail.results?.[f.key])
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Historial de llamadas
                </p>
                {calls === null ? (
                  <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
                  </div>
                ) : calls.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4">Aún no se ha llamado a este prospecto.</p>
                ) : (
                  <div className="space-y-2.5">
                    {calls.map((call, idx) => (
                      <div
                        key={call.id}
                        className="rounded-lg border border-white/[.08] bg-white/[.02] p-3.5"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                            <Phone className="w-3.5 h-3.5 text-gray-500" />
                            Intento {calls.length - idx}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {formatDatetimeCol(call.created_at)}
                          </span>
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {formatDuration(call.duration_sec)}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-auto">
                            {call.in_voicemail
                              ? "Buzón de voz"
                              : call.status === "ended_success"
                                ? "Contestada"
                                : call.status === "missed"
                                  ? "No contestó"
                                  : (call.status_label ?? call.status)}
                          </span>
                        </div>
                        {call.summary && (
                          <p className="text-xs text-gray-400 mt-2 leading-relaxed">{call.summary}</p>
                        )}
                        {call.audio_url && (
                          <audio controls preload="none" src={call.audio_url} className="mt-2 w-full h-9" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
