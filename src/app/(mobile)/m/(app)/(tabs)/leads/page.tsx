"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import { filterPipelineStages, formatLeadValue } from "@/lib/crm-record";
import { AppLoader } from "../../../AppLoader";
import { usePullToRefresh } from "../../../usePullToRefresh";
import { StageFilterSheet } from "../../../StageFilterSheet";
import { StatusFilterSheet } from "../../../StatusFilterSheet";
import { FilterIcon, LeadsTabIcon } from "../../../icons";
import type { CrmLead, CrmLeadFilter, CrmPipelineStage } from "@/types/crm";

function LeadCard({ lead, showStage }: { lead: CrmLead; showStage: boolean }) {
  const router = useRouter();
  return (
    <button type="button" className="lead-card" onClick={() => router.push(`/m/leads/${lead.id}`)}>
      <div className="lc-top">
        <div>
          <div className="lc-title">{lead.title}</div>
          {lead.contact?.name ? <div className="lc-contact">{lead.contact.name}</div> : null}
        </div>
        {lead.temperatura ? <span className={`temp-chip ${lead.temperatura}`}>{lead.temperatura}</span> : null}
      </div>
      {showStage && lead.stage ? (
        <span className="lc-stage-flat">
          <span className="stage-dot" style={{ backgroundColor: lead.stage.color }} />
          {lead.stage.name}
        </span>
      ) : lead.categoria_interes || lead.producto_interes ? (
        <div className="lc-cat">{[lead.categoria_interes, lead.producto_interes].filter(Boolean).join(" · ")}</div>
      ) : null}
      <div className="lc-bottom">
        <span className="lc-days">
          {lead.dias_en_etapa != null && lead.dias_en_etapa > 0 ? `${lead.dias_en_etapa}d en etapa` : "Hoy"}
        </span>
        <span className="lc-value">{formatLeadValue(lead.value_amount, lead.currency)}</span>
      </div>
      {lead.asesor_responsable ? <span className="lc-advisor">{lead.asesor_responsable}</span> : null}
    </button>
  );
}

export default function MobileLeadsPage() {
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [filter, setFilter] = useState<CrmLeadFilter>("open");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [stageSheetOpen, setStageSheetOpen] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await authFetch("/api/crm/leads");
      if (res.status === 403) {
        setError("No tienes acceso al módulo de Leads.");
        setLeads([]);
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setStages(Array.isArray(data.stages) ? data.stages : []);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
      setError(null);
    } catch {
      if (!silent) setError("No se pudo cargar la lista de leads.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { scrollRef, pull, refreshing, handlers } = usePullToRefresh(() => load(true));

  const openLeads = useMemo(() => (leads ?? []).filter(l => l.outcome === "open"), [leads]);
  const openTotal = useMemo(() => openLeads.reduce((sum, l) => sum + (l.value_amount ?? 0), 0), [openLeads]);

  const filteredLeads = useMemo(() => {
    const all = leads ?? [];
    if (filter === "won") return all.filter(l => l.outcome === "won");
    if (filter === "lost") return all.filter(l => l.outcome === "lost");
    if (filter === "all") return all;
    if (filter === "mine") {
      const me = currentUserName.trim().toLowerCase();
      return openLeads.filter(l => l.asesor_responsable?.trim().toLowerCase() === me);
    }
    return openLeads;
  }, [leads, filter, currentUserName, openLeads]);

  const grouped = filter === "open" || filter === "mine";
  const pipelineStages = useMemo(() => filterPipelineStages(stages), [stages]);
  const leadsByStage = useMemo(() => {
    const map = new Map<string, CrmLead[]>();
    for (const s of pipelineStages) map.set(s.id, []);
    for (const l of filteredLeads) {
      const arr = map.get(l.stage_id);
      if (arr) arr.push(l);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [filteredLeads, pipelineStages]);

  const visiblePipelineStages = useMemo(
    () => (stageFilter ? pipelineStages.filter(s => s.id === stageFilter) : pipelineStages),
    [pipelineStages, stageFilter]
  );
  const flatLeads = useMemo(
    () => (stageFilter ? filteredLeads.filter(l => l.stage_id === stageFilter) : filteredLeads),
    [filteredLeads, stageFilter]
  );
  const stageCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of pipelineStages) out[s.id] = leadsByStage.get(s.id)?.length ?? 0;
    return out;
  }, [pipelineStages, leadsByStage]);
  const activeStage = stageFilter ? pipelineStages.find(s => s.id === stageFilter) ?? null : null;
  const hasResults = grouped
    ? visiblePipelineStages.some(s => (leadsByStage.get(s.id)?.length ?? 0) > 0)
    : flatLeads.length > 0;

  const statusCounts = useMemo(() => {
    const all = leads ?? [];
    const me = currentUserName.trim().toLowerCase();
    return {
      open: all.filter(l => l.outcome === "open").length,
      mine: all.filter(l => l.outcome === "open" && l.asesor_responsable?.trim().toLowerCase() === me).length,
      won: all.filter(l => l.outcome === "won").length,
      lost: all.filter(l => l.outcome === "lost").length,
      all: all.length
    } as Record<CrmLeadFilter, number>;
  }, [leads, currentUserName]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="app-head">
        <div className="head-row">
          <div>
            <p className="kicker">Noova360</p>
            <h1>Leads</h1>
          </div>
          <div className="head-actions">
            <button
              type="button"
              className={`filter-btn${filter !== "open" ? " active" : ""}`}
              aria-label="Filtrar por estado"
              onClick={() => setStatusSheetOpen(true)}
            >
              <FilterIcon />
              {filter !== "open" ? <span className="fb-dot" /> : null}
            </button>
            <button
              type="button"
              className={`filter-btn${activeStage ? " active" : ""}`}
              aria-label="Filtrar por etapa"
              onClick={() => setStageSheetOpen(true)}
            >
              <LeadsTabIcon />
              {activeStage ? <span className="fb-dot" style={{ background: activeStage.color }} /> : null}
            </button>
          </div>
        </div>
        {leads !== null && !error ? (
          <p className="head-sub">
            {formatLeadValue(openTotal, "COP")} en {openLeads.length} leads abiertos
          </p>
        ) : null}
      </div>

      <div className="nv-m-scroll" ref={scrollRef} {...handlers}>
        <div className="pull-indicator" style={{ height: pull }}>
          <span className="spinner" />
        </div>
        <div className="lead-body">
          {leads === null ? (
            <div className="loading-block">
              <AppLoader />
            </div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : !hasResults ? (
            <div className="empty-state">
              {activeStage ? `No hay leads en "${activeStage.name}" con este filtro.` : "No hay leads con este filtro."}
            </div>
          ) : grouped ? (
            visiblePipelineStages.map(stage => {
              const stageLeads = leadsByStage.get(stage.id) ?? [];
              if (stageLeads.length === 0) return null;
              return (
                <div key={stage.id} className="stage-section">
                  <div className="stage-head">
                    <span className="stage-dot" style={{ backgroundColor: stage.color }} />
                    <span className="stage-name">{stage.name}</span>
                    <span className="stage-count">{stageLeads.length}</span>
                    <span className="stage-line" />
                  </div>
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} showStage={false} />
                  ))}
                </div>
              );
            })
          ) : (
            <div className="stage-section">
              {flatLeads.map(lead => (
                <LeadCard key={lead.id} lead={lead} showStage />
              ))}
            </div>
          )}
        </div>
      </div>

      {stageSheetOpen ? (
        <StageFilterSheet
          stages={pipelineStages}
          counts={stageCounts}
          totalCount={filteredLeads.length}
          selectedStageId={stageFilter}
          onSelect={id => { setStageFilter(id); setStageSheetOpen(false); }}
          onClose={() => setStageSheetOpen(false)}
        />
      ) : null}

      {statusSheetOpen ? (
        <StatusFilterSheet
          counts={statusCounts}
          selected={filter}
          onSelect={f => { setFilter(f); setStatusSheetOpen(false); }}
          onClose={() => setStatusSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
