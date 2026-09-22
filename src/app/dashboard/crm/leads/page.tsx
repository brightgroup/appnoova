"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownWideNarrow,
  ChevronLeft,
  Filter,
  Inbox,
  Kanban,
  List,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2
} from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost, btnPrimary, btnFilterGroup, btnFilterActive, btnFilterIdle,
  registryPage, registryToolbar, registryTable,
  registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableCell,
  registryTableRowClickable, registryTableCellFirst, registryTableEmpty, registryTableLoading,
  registryListShell, inputSearch,
  textMuted
} from "@/lib/brand-ui";
import {
  CRM_LEAD_OUTCOME_LABELS,
  crmOutcomeBadgeVariant,
  formatLeadValue
} from "@/lib/crm-record";
import { resolveCrmStageIcon } from "@/lib/crm-stage-icons";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import {
  DATE_RANGE_ALL,
  dateRangeMatches,
  isDateRangeActive,
  type DateRangeValue
} from "@/lib/date-range-filter";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ExportColumn } from "@/lib/export-table";
import { CrmLeadsKanban } from "@/components/crm/CrmLeadsKanban";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import { Badge } from "@/components/ui/Badge";
import type { CrmLead, CrmLeadFilter, CrmLeadsView, CrmPipelineStage } from "@/types/crm";

type SortField = "llegada" | "alfabetico";
type SortDirection = "asc" | "desc";

const OUTCOME_OPTIONS: { id: CrmLeadFilter; label: string }[] = [
  { id: "open", label: "Abiertos" },
  { id: "mine", label: "Míos" },
  { id: "won", label: "Ganados" },
  { id: "lost", label: "Perdidos" },
  { id: "all", label: "Todos" }
];

function DirectionPills({
  active,
  onSelect
}: {
  active: SortDirection | null;
  onSelect: (dir: SortDirection) => void;
}) {
  return (
    <div className={btnFilterGroup}>
      <button type="button" onClick={() => onSelect("asc")} className={active === "asc" ? btnFilterActive : btnFilterIdle}>
        Ascendente
      </button>
      <button type="button" onClick={() => onSelect("desc")} className={active === "desc" ? btnFilterActive : btnFilterIdle}>
        Descendente
      </button>
    </div>
  );
}

function OrdenarPopover({
  sortField,
  sortDirection,
  onChange
}: {
  sortField: SortField;
  sortDirection: SortDirection;
  onChange: (field: SortField, direction: SortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDefault = sortField === "llegada" && sortDirection === "desc";

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} className={`${btnGhost} gap-1.5 relative`}>
        <ArrowDownWideNarrow className="w-4 h-4" /> Ordenar
        {!isDefault && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#0f7eff]" />}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Cerrar ordenar" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 z-50 mt-2 w-72 ${registryListShell} p-4 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Ordenar</p>
              <button
                type="button"
                onClick={() => onChange("llegada", "desc")}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" /> Restablecer
              </button>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Llegada</p>
              <DirectionPills
                active={sortField === "llegada" ? sortDirection : null}
                onSelect={dir => onChange("llegada", dir)}
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Alfabéticamente</p>
              <DirectionPills
                active={sortField === "alfabetico" ? sortDirection : null}
                onSelect={dir => onChange("alfabetico", dir)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FiltroPopover({
  filter,
  onFilterChange,
  stageFilter,
  onStageFilterChange,
  dateRange,
  onDateRangeChange,
  stages
}: {
  filter: CrmLeadFilter;
  onFilterChange: (v: CrmLeadFilter) => void;
  stageFilter: string | null;
  onStageFilterChange: (v: string | null) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (v: DateRangeValue) => void;
  stages: CrmPipelineStage[];
}) {
  const [open, setOpen] = useState(false);
  const isDefault = filter === "open" && stageFilter === null && !isDateRangeActive(dateRange);

  const stageOptions = useMemo(
    () => [
      { value: "", label: "Todas las etapas" },
      ...stages.map(s => ({ value: s.id, label: s.name }))
    ],
    [stages]
  );

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} className={`${btnGhost} gap-1.5 relative`}>
        <Filter className="w-4 h-4" /> Filtro
        {!isDefault && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#0f7eff]" />}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Cerrar filtro" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 z-50 mt-2 w-72 ${registryListShell} p-4 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Filtro</p>
              <button
                type="button"
                onClick={() => {
                  onFilterChange("open");
                  onStageFilterChange(null);
                  onDateRangeChange(DATE_RANGE_ALL);
                }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar
              </button>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Etapa</p>
              <NoovaSelect
                value={stageFilter ?? ""}
                onChange={v => onStageFilterChange(v || null)}
                options={stageOptions}
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Estado</p>
              <NoovaSelect value={filter} onChange={v => onFilterChange(v as CrmLeadFilter)} options={OUTCOME_OPTIONS.map(o => ({ value: o.id, label: o.label }))} />
            </div>
            <DateRangeFilter value={dateRange} onChange={onDateRangeChange} label="Fecha de creación" />
          </div>
        </>
      )}
    </div>
  );
}

export default function CrmLeadsPage() {
  const router = useRouter();
  const { canWrite } = useModuleWriteAccess("crm", "edit");
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [view, setView] = useState<CrmLeadsView>("kanban");
  const [filter, setFilter] = useState<CrmLeadFilter>("open");
  const [sortField, setSortField] = useState<SortField>("llegada");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>(DATE_RANGE_ALL);
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
    let list = leads;
    if (filter === "won") list = list.filter(l => l.outcome === "won");
    else if (filter === "lost") list = list.filter(l => l.outcome === "lost");
    else if (filter === "all") list = list;
    else {
      list = list.filter(l => l.outcome === "open");
      if (filter === "mine") {
        const me = currentUserName.trim().toLowerCase();
        list = list.filter(l => l.asesor_responsable?.trim().toLowerCase() === me);
      }
    }

    if (stageFilter) list = list.filter(l => l.stage_id === stageFilter);

    if (isDateRangeActive(dateRange)) list = list.filter(l => dateRangeMatches(dateRange, l.created_at));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        l => l.title.toLowerCase().includes(q) || (l.contact?.name ?? "").toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    if (sortField === "llegada") {
      sorted.sort((a, b) =>
        sortDirection === "desc" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)
      );
    } else {
      sorted.sort((a, b) =>
        sortDirection === "asc" ? a.title.localeCompare(b.title, "es") : b.title.localeCompare(a.title, "es")
      );
    }
    return sorted;
  }, [leads, filter, currentUserName, stageFilter, dateRange, search, sortField, sortDirection]);

  const pagination = useRegistryPagination(
    filteredLeads.length,
    `${filter}-${view}-${stageFilter}-${dateRange.preset}-${dateRange.from}-${dateRange.to}-${search}-${sortField}-${sortDirection}`
  );
  const pageRows = pagination.pageRows(filteredLeads);

  const stageName = useCallback(
    (stageId: string | null) => stages.find(s => s.id === stageId)?.name ?? "",
    [stages]
  );

  const exportColumns = useMemo<ExportColumn<CrmLead>[]>(
    () => [
      { header: "Título", value: l => l.title },
      { header: "Contacto", value: l => l.contact?.name ?? "" },
      { header: "Etapa", value: l => l.stage?.name ?? stageName(l.stage_id) },
      { header: "Estado", value: l => CRM_LEAD_OUTCOME_LABELS[l.outcome] ?? l.outcome },
      { header: "Valor", value: l => formatLeadValue(l.value_amount, l.currency) },
      { header: "Fuente", value: l => l.source ?? "" },
      { header: "Asesor", value: l => l.asesor_responsable ?? "" },
      { header: "Creado", value: l => l.created_at },
      { header: "Actualizado", value: l => l.updated_at },
    ],
    [stageName]
  );

  const kanbanStages = useMemo(
    () => (stageFilter ? stages.filter(s => s.id === stageFilter) : stages),
    [stages, stageFilter]
  );

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

      <div className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
        <RegistryTableLayout
          onRefresh={() => load()}
          refreshing={loading}
          filters={
            <div className="flex items-center gap-2 flex-wrap">
              <div className={btnFilterGroup}>
                <button type="button" onClick={() => setView("kanban")} className={view === "kanban" ? btnFilterActive : btnFilterIdle}>
                  <Kanban className="w-3.5 h-3.5 inline mr-1" />Kanban
                </button>
                <button type="button" onClick={() => setView("list")} className={view === "list" ? btnFilterActive : btnFilterIdle}>
                  <List className="w-3.5 h-3.5 inline mr-1" />Lista
                </button>
              </div>

              <FiltroPopover
                filter={filter}
                onFilterChange={setFilter}
                stageFilter={stageFilter}
                onStageFilterChange={setStageFilter}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                stages={stages}
              />
              <OrdenarPopover
                sortField={sortField}
                sortDirection={sortDirection}
                onChange={(f, d) => {
                  setSortField(f);
                  setSortDirection(d);
                }}
              />

              <div className="relative flex-1 min-w-[160px] max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por título o contacto"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={inputSearch}
                />
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <ExportMenu
                  filename="leads"
                  sheetName="Leads"
                  columns={exportColumns}
                  rows={filteredLeads}
                />
                <Link href="/dashboard/crm/configuracion" className={btnGhost}>
                  <Settings className="w-4 h-4" />
                </Link>
                {canWrite && (
                  <Link href="/dashboard/crm/leads/nuevo" className={btnPrimary}>
                    <Plus className="w-4 h-4" /> Nuevo lead
                  </Link>
                )}
              </div>
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
          {view === "list" && !loading && (
            <div className="flex items-stretch border-b border-white/[.08] mb-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => setStageFilter(null)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-4 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  stageFilter === null ? "text-white" : "text-gray-300 hover:text-white"
                }`}
                style={{ borderColor: stageFilter === null ? "#0f7eff" : "transparent" }}
              >
                <Inbox className="w-4 h-4" style={{ color: stageFilter === null ? "#0f7eff" : "#9ca3af" }} /> Todos
              </button>
              {stages.map(stage => {
                const StageIcon = resolveCrmStageIcon(stage.icon);
                const active = stageFilter === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setStageFilter(stage.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-4 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                      active ? "text-white" : "text-gray-300 hover:text-white"
                    }`}
                    style={{ borderColor: active ? stage.color : "transparent" }}
                  >
                    <StageIcon className="w-4 h-4" style={{ color: active ? stage.color : "#9ca3af" }} /> {stage.name}
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className={registryTableLoading}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando leads…
            </div>
          ) : view === "kanban" ? (
            <CrmLeadsKanban
              stages={kanbanStages}
              outcome={filter}
              currentUserName={currentUserName}
              searchQuery={search}
              sortField={sortField}
              sortDirection={sortDirection}
              dateRange={dateRange}
              onSelectLead={id => router.push(`/dashboard/crm/leads/${id}`)}
              onLeadMoved={lead => setLeads(prev => prev.map(l => (l.id === lead.id ? lead : l)))}
            />
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
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lead.stage?.color ?? "#0f7eff" }} />
                        {lead.stage?.name ?? "—"}
                      </span>
                    </td>
                    <td className={registryTableCell}>
                      <Badge variant={crmOutcomeBadgeVariant(lead.outcome)} uppercase>
                        {CRM_LEAD_OUTCOME_LABELS[lead.outcome]}
                      </Badge>
                    </td>
                    <td className={`${registryTableCell} text-xs text-gray-400 max-w-[200px]`}>
                      <span className="line-clamp-2">{lead.categoria_interes ?? "—"}</span>
                    </td>
                    <td className={`${registryTableCell} text-sm text-[#99c9ff] tabular-nums`}>
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
