"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { formatLeadValue, filterPipelineStages } from "@/lib/crm-record";
import { inputSearch } from "@/lib/brand-ui";
import type { CrmLead, CrmPipelineStage } from "@/types/crm";

const PAGE_SIZE = 25;

interface ColumnState {
  leads: CrmLead[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
}

interface CrmLeadsKanbanProps {
  stages: CrmPipelineStage[];
  outcome: "open" | "mine";
  currentUserName: string;
  onSelectLead: (id: string) => void;
  onLeadMoved: (lead: CrmLead) => void;
}

export function CrmLeadsKanban({ stages, outcome, currentUserName, onSelectLead, onLeadMoved }: CrmLeadsKanbanProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<Record<string, ColumnState>>({});
  const [summary, setSummary] = useState<Record<string, { count: number; sum: number }>>({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const pipelineStages = useMemo(() => filterPipelineStages(stages), [stages]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const boardParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams({ outcome, ...extra });
      if (outcome === "mine" && currentUserName) params.set("asesor", currentUserName);
      if (search) params.set("q", search);
      return params;
    },
    [outcome, currentUserName, search]
  );

  const loadBoard = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/board?${boardParams().toString()}`, { headers });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      const nextColumns: Record<string, ColumnState> = {};
      for (const stage of pipelineStages) {
        const leads: CrmLead[] = data.pages?.[stage.id] ?? [];
        const total = data.summary?.[stage.id]?.count ?? leads.length;
        nextColumns[stage.id] = { leads, total, hasMore: leads.length < total, loadingMore: false };
      }
      setColumns(nextColumns);
      setSummary(data.summary ?? {});
    }
    setLoading(false);
  }, [boardParams, pipelineStages]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const loadMore = async (stageId: string) => {
    const col = columns[stageId];
    if (!col || col.loadingMore) return;
    setColumns(prev => ({ ...prev, [stageId]: { ...prev[stageId], loadingMore: true } }));

    const headers = await getAuthHeaders();
    const params = boardParams({ stage_id: stageId, offset: String(col.leads.length), limit: String(PAGE_SIZE) });
    const res = await fetch(`/api/crm/leads/board?${params.toString()}`, { headers });
    const data = await res.json().catch(() => null);
    setColumns(prev => {
      const current = prev[stageId];
      if (!current) return prev;
      if (res.ok && data) {
        return {
          ...prev,
          [stageId]: {
            leads: [...current.leads, ...(data.leads ?? [])],
            total: data.total ?? current.total,
            hasMore: !!data.has_more,
            loadingMore: false
          }
        };
      }
      return { ...prev, [stageId]: { ...current, loadingMore: false } };
    });
  };

  const moveLeadOptimistic = async (leadId: string, targetStageId: string) => {
    let sourceStageId: string | null = null;
    let lead: CrmLead | null = null;
    for (const [sid, col] of Object.entries(columns)) {
      const found = col.leads.find(l => l.id === leadId);
      if (found) {
        sourceStageId = sid;
        lead = found;
        break;
      }
    }
    if (!lead || !sourceStageId || sourceStageId === targetStageId) return;

    const targetStage = pipelineStages.find(s => s.id === targetStageId);
    const targetSortOrder = summary[targetStageId]?.count ?? (columns[targetStageId]?.leads.length ?? 0);
    const prevColumns = columns;
    const prevSummary = summary;
    const value = lead.value_amount ?? 0;
    const movedLead: CrmLead = {
      ...lead,
      stage_id: targetStageId,
      sort_order: targetSortOrder,
      stage: targetStage ?? lead.stage
    };

    setColumns(prev => {
      const next = { ...prev };
      next[sourceStageId!] = {
        ...next[sourceStageId!],
        leads: next[sourceStageId!].leads.filter(l => l.id !== leadId),
        total: Math.max(0, next[sourceStageId!].total - 1)
      };
      next[targetStageId] = {
        ...next[targetStageId],
        leads: [...next[targetStageId].leads, movedLead],
        total: next[targetStageId].total + 1
      };
      return next;
    });
    setSummary(prev => {
      const next = { ...prev };
      if (next[sourceStageId!]) {
        next[sourceStageId!] = { count: Math.max(0, next[sourceStageId!].count - 1), sum: next[sourceStageId!].sum - value };
      }
      if (next[targetStageId]) {
        next[targetStageId] = { count: next[targetStageId].count + 1, sum: next[targetStageId].sum + value };
      }
      return next;
    });

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stage_id: targetStageId, sort_order: targetSortOrder })
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.lead) {
      onLeadMoved(data.lead);
      setColumns(prev => {
        const col = prev[targetStageId];
        if (!col) return prev;
        return { ...prev, [targetStageId]: { ...col, leads: col.leads.map(l => (l.id === leadId ? data.lead : l)) } };
      });
    } else {
      setColumns(prevColumns);
      setSummary(prevSummary);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar lead o contacto…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputSearch}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando tablero…
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[480px]">
          {pipelineStages.map(stage => {
            const col = columns[stage.id];
            const stageLeads = col?.leads ?? [];
            const stageSummary = summary[stage.id];
            const isOver = overStageId === stage.id;
            return (
              <div
                key={stage.id}
                className={`w-[280px] shrink-0 flex flex-col rounded-xl border transition-colors duration-200 ${
                  isOver ? "border-[#0f7eff]/40 bg-[#0f7eff]/[.04]" : "border-white/[.08] bg-white/[.02]"
                }`}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverStageId(stage.id);
                }}
                onDragLeave={() => setOverStageId(prev => (prev === stage.id ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setOverStageId(null);
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  if (id) moveLeadOptimistic(id, stage.id);
                  setDragId(null);
                }}
              >
                <div className="px-4 py-3 border-b border-white/[.06]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold text-white truncate">{stage.name}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <span className="text-xs text-gray-500 tabular-nums">
                      <b className="text-gray-400 font-medium">{stageSummary?.count ?? stageLeads.length}</b> leads
                    </span>
                    {!!stageSummary?.sum && (
                      <span className="text-xs font-semibold text-[#99c9ff] tabular-nums shrink-0">
                        {formatLeadValue(stageSummary.sum, "COP")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[120px]">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => {
                        setDragId(lead.id);
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStageId(null);
                      }}
                      onClick={() => onSelectLead(lead.id)}
                      className={`group cursor-grab active:cursor-grabbing rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2.5 transition-colors hover:bg-white/[.05] ${
                        dragId === lead.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white truncate">{lead.title}</p>
                        {lead.temperatura && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                              lead.temperatura === "caliente"
                                ? "bg-[var(--nv-accent)]/15 text-[var(--nv-hubspot-teal)]"
                                : lead.temperatura === "tibio"
                                  ? "bg-[var(--nv-hubspot-teal)]/15 text-[var(--nv-hubspot-teal)]"
                                  : "bg-sky-500/15 text-sky-300"
                            }`}
                          >
                            {lead.temperatura}
                          </span>
                        )}
                      </div>
                      {lead.contact?.name && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.contact.name}</p>
                      )}
                      {(lead.categoria_interes || lead.producto_interes) && (
                        <p className="mt-2 text-[11px] leading-snug text-gray-400 line-clamp-2">
                          {[lead.categoria_interes, lead.producto_interes].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-gray-500 tabular-nums">
                          {lead.dias_en_etapa != null && lead.dias_en_etapa > 0
                            ? `${lead.dias_en_etapa}d en etapa`
                            : "—"}
                        </span>
                        <span className="text-xs font-semibold text-[#99c9ff] tabular-nums shrink-0">
                          {formatLeadValue(lead.value_amount, lead.currency)}
                        </span>
                      </div>
                      {lead.asesor_responsable && (
                        <p className="mt-1 text-[10px] text-gray-500 truncate">
                          {lead.asesor_responsable}
                        </p>
                      )}
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <p className="text-xs text-center text-gray-600 py-8 pointer-events-none">
                      {isOver ? "Soltar aquí" : search ? "Sin resultados en esta etapa" : "Arrastra leads aquí"}
                    </p>
                  )}
                  {!search && col?.hasMore && (
                    <button
                      type="button"
                      onClick={() => loadMore(stage.id)}
                      disabled={col.loadingMore}
                      className="w-full rounded-lg border border-dashed border-white/[.14] bg-white/[.02] py-2 text-[11px] font-semibold text-gray-400 hover:text-white hover:bg-white/[.05] hover:border-[#0f7eff]/50 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {col.loadingMore ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        `Cargar ${Math.min(PAGE_SIZE, col.total - col.leads.length)} más (${col.total - col.leads.length} restantes)`
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
