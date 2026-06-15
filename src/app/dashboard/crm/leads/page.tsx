"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Kanban, List, Loader2, Plus, Settings, Trash2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost, btnPrimary, btnFilterGroup, btnFilterActive, btnFilterIdle,
  registryPage, registryToolbar, registryContent, registryTable,
  registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableCell,
  registryTableRowClickable, registryTableCellFirst, registryTableEmpty, registryTableLoading,
  textMuted
} from "@/lib/brand-ui";
import {
  CRM_LEAD_OUTCOME_LABELS,
  formatLeadValue
} from "@/lib/crm-record";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { CrmLeadsKanban } from "@/components/crm/CrmLeadsKanban";
import type { CrmLead, CrmLeadFilter, CrmLeadsView, CrmPipelineStage } from "@/types/crm";

function outcomeBadge(outcome: CrmLead["outcome"]) {
  if (outcome === "won") return "bg-emerald-500/15 text-emerald-300";
  if (outcome === "lost") return "bg-gray-500/15 text-gray-400";
  return "bg-white/[.06] text-gray-300";
}

export default function CrmLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [view, setView] = useState<CrmLeadsView>("kanban");
  const [filter, setFilter] = useState<CrmLeadFilter>("open");
  const [loading, setLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/leads", { headers });
    const data = await res.json();
    if (res.ok) {
      setLeads(data.leads ?? []);
      setStages(data.stages ?? []);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredLeads = useMemo(() => {
    if (filter === "won") return leads.filter(l => l.outcome === "won");
    if (filter === "lost") return leads.filter(l => l.outcome === "lost");
    if (filter === "all") return leads;

    let list = leads.filter(l => l.outcome === "open");
    if (filter === "mine") {
      const me = currentUserName.trim().toLowerCase();
      list = list.filter(l => l.asesor_responsable?.trim().toLowerCase() === me);
    }
    return list;
  }, [leads, filter, currentUserName]);

  const pagination = useRegistryPagination(filteredLeads.length, `${filter}-${view}`);
  const pageRows = pagination.pageRows(filteredLeads);

  const kanbanFilters: CrmLeadFilter[] = ["open", "mine"];

  const deleteLead = async (id: string) => {
    if (!confirm("¿Eliminar lead?")) return;
    const headers = await getAuthHeaders();
    await fetch(`/api/crm/leads/${id}`, { method: "DELETE", headers });
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Leads</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Pipeline de oportunidades asistido por ORI</p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        <RegistryTableLayout
          onRefresh={() => load()}
          refreshing={loading}
          filters={
            <div className="flex flex-wrap items-center gap-3">
              <div className={btnFilterGroup}>
                {([
                  ["open", "Abiertos"],
                  ["mine", "Míos"],
                  ["won", "Ganados"],
                  ["lost", "Perdidos"],
                  ["all", "Todos"]
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={filter === id ? btnFilterActive : btnFilterIdle}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={btnFilterGroup}>
                <button type="button" onClick={() => setView("kanban")} className={view === "kanban" ? btnFilterActive : btnFilterIdle}>
                  <Kanban className="w-3.5 h-3.5 inline mr-1" />Kanban
                </button>
                <button type="button" onClick={() => setView("list")} className={view === "list" ? btnFilterActive : btnFilterIdle}>
                  <List className="w-3.5 h-3.5 inline mr-1" />Lista
                </button>
              </div>
            </div>
          }
          action={
            <div className="flex items-center gap-2">
              <Link href="/dashboard/crm/configuracion" className={btnGhost}>
                <Settings className="w-4 h-4" />
              </Link>
              <Link href="/dashboard/crm/leads/nuevo" className={btnPrimary}>
                <Plus className="w-4 h-4" /> Nuevo lead
              </Link>
            </div>
          }
          footer={!loading && view === "list" && filteredLeads.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="leads"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando leads…
            </div>
          ) : view === "kanban" ? (
            kanbanFilters.includes(filter) ? (
              <CrmLeadsKanban
                leads={filteredLeads}
                stages={stages}
                onLeadsChange={setLeads}
                onSelectLead={id => router.push(`/dashboard/crm/leads/${id}`)}
              />
            ) : (
              <div className={registryTableEmpty}>
                El kanban muestra leads abiertos. Usa filtros Abiertos o Míos.
              </div>
            )
          ) : filteredLeads.length === 0 ? (
            <div className={registryTableEmpty}>
              No hay leads con estos filtros.
            </div>
          ) : (
            <table className={`${registryTable} min-w-[860px]`}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Lead</th>
                  <th className={registryTableHeadCell}>Contacto</th>
                  <th className={registryTableHeadCell}>Etapa</th>
                  <th className={registryTableHeadCell}>Resultado</th>
                  <th className={registryTableHeadCell}>Categoría</th>
                  <th className={registryTableHeadCell}>Valor</th>
                  <th className={`${registryTableHeadCell} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(lead => (
                  <tr
                    key={lead.id}
                    className={registryTableRowClickable}
                    onClick={() => router.push(`/dashboard/crm/leads/${lead.id}`)}
                  >
                    <td className={`${registryTableCellFirst} text-sm font-medium text-white`}>{lead.title}</td>
                    <td className={`${registryTableCell} text-xs text-gray-400`}>{lead.contact?.name ?? "—"}</td>
                    <td className={registryTableCell}>
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lead.stage?.color ?? "#5b5bf6" }} />
                        {lead.stage?.name ?? "—"}
                      </span>
                    </td>
                    <td className={registryTableCell}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${outcomeBadge(lead.outcome)}`}>
                        {CRM_LEAD_OUTCOME_LABELS[lead.outcome]}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-xs text-gray-400 max-w-[200px]`}>
                      <span className="line-clamp-2">{lead.categoria_interes ?? "—"}</span>
                    </td>
                    <td className={`${registryTableCell} text-sm text-[#a5a5ff] tabular-nums`}>
                      {formatLeadValue(lead.value_amount, lead.currency)}
                    </td>
                    <td className={`${registryTableCell} text-center`} onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => deleteLead(lead.id)} className={btnGhost}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>
      </div>
    </div>
  );
}
