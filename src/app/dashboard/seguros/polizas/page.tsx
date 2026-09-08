"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Upload, MoreHorizontal, ShieldCheck, Trash2, RefreshCw } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost,
  btnPrimary,
  btnFilterGroup,
  btnFilterActive,
  btnFilterIdle,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadRow,
  registryTableRowClickable,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { useSortableRows } from "@/hooks/useSortableRows";
import { SortableTh } from "@/components/ui/SortableTh";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import { PolizaModal, type PolizaFormValues } from "@/components/seguros/PolizaModal";
import { PolizasImportDialog } from "@/components/seguros/PolizasImportDialog";
import type { PolizaEstado, PolizaRecord } from "@/lib/insurers/polizas-db";

type Filter = "todas" | PolizaEstado;
type SortKey = "aseguradora" | "ramo" | "numero_poliza" | "vigencia_hasta" | "prima" | "estado";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "activa", label: "Activas" },
  { id: "vencida", label: "Vencidas" },
  { id: "cancelada", label: "Canceladas" }
];

const ESTADO_BADGE: Record<PolizaEstado, BadgeVariant> = {
  cotizada: "sky",
  activa: "emerald",
  vencida: "danger",
  cancelada: "neutral",
  renovada: "violet"
};

function diasRestantes(vigenciaHasta: string | null): number | null {
  if (!vigenciaHasta) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${vigenciaHasta}T00:00:00`);
  return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
}

function formatCOP(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

export default function PolizasPage() {
  const { canWrite: canEdit } = useModuleWriteAccess("seguros", "edit");

  const [polizas, setPolizas] = useState<PolizaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [polizaModal, setPolizaModal] = useState<{ poliza?: PolizaRecord } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filter !== "todas") params.set("estado", filter);
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/seguros/polizas?${params.toString()}`, { headers });
    if (res.ok) setPolizas((await res.json()).polizas ?? []);
    if (!silent) setLoading(false);
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  const getSortValue = useCallback((p: PolizaRecord, key: SortKey): string | number | null => {
    switch (key) {
      case "aseguradora": return p.aseguradora;
      case "ramo": return p.ramo;
      case "numero_poliza": return p.numeroPoliza ?? "";
      case "vigencia_hasta": return p.vigenciaHasta ?? "";
      case "prima": return p.prima ?? 0;
      case "estado": return p.estado;
    }
  }, []);
  const { sort, toggleSort, sorted } = useSortableRows(polizas, getSortValue);
  const pagination = useRegistryPagination(sorted.length, `${search}-${filter}`);
  const pageRows = pagination.pageRows(sorted);

  const counts = useMemo(() => {
    const byEstado: Record<string, number> = {};
    for (const p of polizas) byEstado[p.estado] = (byEstado[p.estado] ?? 0) + 1;
    return byEstado;
  }, [polizas]);

  async function submitPoliza(values: PolizaFormValues) {
    setSaving(true);
    setModalError(null);
    const editing = polizaModal?.poliza;
    const headers = await getAuthHeaders();
    const res = editing
      ? await fetch(`/api/seguros/polizas/${editing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            aseguradora: values.aseguradora,
            ramo: values.ramo,
            numero_poliza: values.numero_poliza || null,
            vigencia_desde: values.vigencia_desde || null,
            vigencia_hasta: values.vigencia_hasta || null,
            prima: values.prima === "" ? null : Number(values.prima),
            periodicidad_pago: values.periodicidad_pago || null
          })
        })
      : await fetch("/api/seguros/polizas", {
          method: "POST",
          headers,
          body: JSON.stringify({
            contact_id: values.contact_id,
            tomador: values.tomador,
            documento: values.documento || null,
            telefono: values.telefono || null,
            aseguradora: values.aseguradora,
            ramo: values.ramo,
            numero_poliza: values.numero_poliza || null,
            vigencia_desde: values.vigencia_desde || null,
            vigencia_hasta: values.vigencia_hasta || null,
            prima: values.prima === "" ? null : Number(values.prima),
            periodicidad_pago: values.periodicidad_pago || null
          })
        });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setModalError(json.error ?? "Error al guardar");
      return;
    }
    setPolizaModal(null);
    void load(true);
  }

  async function deletePoliza(p: PolizaRecord) {
    if (!confirm(`¿Eliminar la póliza ${p.numeroPoliza ?? "(sin número)"} de ${p.aseguradora}?`)) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/polizas/${p.id}`, { method: "DELETE", headers });
    if (res.ok) void load(true);
  }

  async function syncSoftseguros() {
    setSyncing(true);
    setSyncMessage(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/softseguros/sync-polizas", { method: "POST", headers });
    const json = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setSyncMessage(json.error ?? "No se pudo sincronizar con Softseguros");
      return;
    }
    setSyncMessage(`${json.creadas} creada(s), ${json.actualizadas} actualizada(s).`);
    void load(true);
  }

  return (
    <>
      <ChannelListPage
        title="Cartera de pólizas"
        description="Registro operativo de tus pólizas — lo justo para disparar renovaciones y siniestros."
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por número o aseguradora…"
        onRefresh={() => load()}
        refreshing={loading}
        error={syncMessage && syncMessage.includes("No se pudo") ? syncMessage : undefined}
        filters={
          <div className={btnFilterGroup}>
            {FILTERS.map(({ id, label }) => {
              const count = id === "todas" ? polizas.length : counts[id] ?? 0;
              return (
                <button key={id} type="button" onClick={() => setFilter(id)} className={filter === id ? btnFilterActive : btnFilterIdle}>
                  {label} ({count})
                </button>
              );
            })}
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ExportMenu
              filename="cartera-polizas"
              sheetName="Pólizas"
              columns={[
                { header: "Aseguradora", value: (p: PolizaRecord) => p.aseguradora },
                { header: "Ramo", value: (p: PolizaRecord) => p.ramo },
                { header: "Número", value: (p: PolizaRecord) => p.numeroPoliza ?? "" },
                { header: "Vigencia hasta", value: (p: PolizaRecord) => p.vigenciaHasta ?? "" },
                { header: "Prima", value: (p: PolizaRecord) => p.prima ?? "" },
                { header: "Estado", value: (p: PolizaRecord) => p.estado }
              ]}
              rows={sorted}
            />
            {canEdit && (
              <>
                <button type="button" onClick={syncSoftseguros} disabled={syncing} className={btnGhost}>
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizar Softseguros
                </button>
                <button type="button" onClick={() => setImportOpen(true)} className={btnGhost}>
                  <Upload className="w-4 h-4" /> Importar Excel
                </button>
                <button type="button" onClick={() => setPolizaModal({})} className={btnPrimary}>
                  <Plus className="w-4 h-4" /> Nueva póliza
                </button>
              </>
            )}
          </div>
        }
        footer={
          sorted.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="pólizas"
            />
          ) : undefined
        }
      >
        {syncMessage && !syncMessage.includes("No se pudo") && (
          <p className="mb-3 text-xs text-emerald-300">{syncMessage}</p>
        )}
        {sorted.length === 0 ? (
          <div className={registryTableEmpty}>
            {search.trim() || filter !== "todas"
              ? "No hay pólizas con estos filtros."
              : canEdit
                ? "Aún no hay pólizas. Crea una, importa tu Excel o sincroniza Softseguros."
                : "Aún no hay pólizas registradas."}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[900px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <SortableTh label="Aseguradora" sortKey="aseguradora" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Ramo" sortKey="ramo" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Número" sortKey="numero_poliza" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Vence" sortKey="vigencia_hasta" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Prima" sortKey="prima" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <SortableTh label="Estado" sortKey="estado" activeKey={sort.key} direction={sort.direction} onSort={toggleSort} />
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(p => {
                const dias = diasRestantes(p.vigenciaHasta);
                return (
                  <tr key={p.id} className={registryTableRowClickable} onClick={() => setPolizaModal({ poliza: p })}>
                    <td className={registryTableCellFirst}>
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                        <ShieldCheck className="w-4 h-4 text-[#99c9ff] shrink-0" />
                        {p.aseguradora}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-sm text-gray-300`}>{p.ramo}</td>
                    <td className={`${registryTableCell} text-sm font-mono text-gray-400`}>{p.numeroPoliza || "—"}</td>
                    <td className={registryTableCell}>
                      {p.vigenciaHasta ? (
                        <span className={`text-sm ${dias !== null && dias <= 30 && p.estado === "activa" ? "text-amber-300 font-medium" : "text-gray-300"}`}>
                          {p.vigenciaHasta}
                          {dias !== null && p.estado === "activa" && (
                            <span className="block text-[11px] text-gray-500">
                              {dias < 0 ? `Venció hace ${Math.abs(dias)}d` : `Faltan ${dias}d`}
                            </span>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={`${registryTableCell} text-sm text-gray-300`}>{formatCOP(p.prima)}</td>
                    <td className={registryTableCell}>
                      <Badge variant={ESTADO_BADGE[p.estado]}>{p.estado}</Badge>
                    </td>
                    <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                      <NoovaAnchoredMenu
                        open={openMenuId === p.id}
                        onClose={() => setOpenMenuId(null)}
                        menuClassName="min-w-[160px]"
                        anchor={
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setOpenMenuId(prev => (prev === p.id ? null : p.id)); }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        }
                      >
                        {canEdit && (
                          <NoovaListMenuItem onClick={() => { setOpenMenuId(null); setPolizaModal({ poliza: p }); }}>
                            Editar
                          </NoovaListMenuItem>
                        )}
                        {canEdit && (
                          <NoovaListMenuItem danger onClick={() => { setOpenMenuId(null); deletePoliza(p); }}>
                            <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Eliminar</span>
                          </NoovaListMenuItem>
                        )}
                      </NoovaAnchoredMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <PolizaModal
        open={!!polizaModal}
        poliza={polizaModal?.poliza ?? null}
        saving={saving}
        error={modalError}
        onClose={() => setPolizaModal(null)}
        onSubmit={submitPoliza}
      />
      <PolizasImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => load(true)} />
    </>
  );
}
