"use client";

import { useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { formatLeadValue } from "@/lib/crm-record";
import { formatProximaAccionFecha } from "@/lib/crm-lead-utils";
import { filterPipelineStages } from "@/lib/crm-record";
import type { CrmLead, CrmPipelineStage } from "@/types/crm";

interface CrmLeadsKanbanProps {
  leads: CrmLead[];
  stages: CrmPipelineStage[];
  onLeadsChange: (leads: CrmLead[]) => void;
  onSelectLead: (id: string) => void;
}

export function CrmLeadsKanban({ leads, stages, onLeadsChange, onSelectLead }: CrmLeadsKanbanProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const pipelineStages = useMemo(() => filterPipelineStages(stages), [stages]);
  const openLeads = useMemo(() => leads.filter(l => l.outcome === "open"), [leads]);

  const leadsByStage = useMemo(() => {
    const map = new Map<string, CrmLead[]>();
    for (const s of pipelineStages) map.set(s.id, []);
    for (const l of openLeads) {
      const arr = map.get(l.stage_id) ?? [];
      arr.push(l);
      map.set(l.stage_id, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [openLeads, pipelineStages]);

  const moveLeadOptimistic = async (leadId: string, targetStageId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage_id === targetStageId) return;

    const targetStage = pipelineStages.find(s => s.id === targetStageId);
    const targetCount = (leadsByStage.get(targetStageId) ?? []).filter(l => l.id !== leadId).length;
    const prevLeads = leads;

    const optimistic = leads.map(l =>
      l.id === leadId
        ? {
            ...l,
            stage_id: targetStageId,
            sort_order: targetCount,
            stage: targetStage ?? l.stage
          }
        : l
    );
    onLeadsChange(optimistic);

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stage_id: targetStageId, sort_order: targetCount })
    });
    const data = await res.json();
    if (res.ok) {
      onLeadsChange(prevLeads.map(l => (l.id === leadId ? data.lead : l)));
    } else {
      onLeadsChange(prevLeads);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[480px]">
      {pipelineStages.map(stage => {
        const stageLeads = leadsByStage.get(stage.id) ?? [];
        const isOver = overStageId === stage.id;
        return (
          <div
            key={stage.id}
            className={`w-[280px] shrink-0 flex flex-col rounded-xl border transition-colors duration-200 ${
              isOver
                ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/[.04]"
                : "border-white/[.08] bg-white/[.02]"
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
            <div className="px-4 py-3 border-b border-white/[.06] flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold text-white truncate">{stage.name}</span>
              </div>
              <span className="text-xs text-gray-500 tabular-nums">{stageLeads.length}</span>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[120px]">
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
                  className={`group cursor-grab active:cursor-grabbing rounded-lg border px-3 py-2.5 transition-colors hover:bg-white/[.05] ${
                    dragId === lead.id ? "opacity-40" : ""
                  } ${
                    lead.is_overdue
                      ? "border-amber-500/35 bg-amber-500/[.06]"
                      : lead.is_stalled
                        ? "border-orange-500/25 bg-orange-500/[.04]"
                        : "border-white/[.08] bg-white/[.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate">{lead.title}</p>
                    {lead.temperatura && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          lead.temperatura === "caliente"
                            ? "bg-orange-500/20 text-orange-200"
                            : lead.temperatura === "tibio"
                              ? "bg-amber-500/15 text-amber-200"
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
                  {lead.proxima_accion && (
                    <p className="mt-2 text-[11px] leading-snug text-gray-300 line-clamp-2">
                      {lead.proxima_accion}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                    <span
                      className={`tabular-nums ${
                        lead.is_overdue ? "text-amber-300 font-medium" : "text-gray-500"
                      }`}
                    >
                      {formatProximaAccionFecha(lead.proxima_accion_fecha)}
                    </span>
                    <span className="text-xs font-semibold text-[#a5a5ff] tabular-nums shrink-0">
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
                  {isOver ? "Soltar aquí" : "Arrastra leads aquí"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
