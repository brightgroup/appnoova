"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Upload, MoreHorizontal, ShieldCheck, Trash2, RefreshCw, Settings } from "lucide-react";
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
  registryTableHeadCell,
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
import { PolizasSubTabs } from "@/components/seguros/PolizasSubTabs";
import { PolizaColumnPicker } from "@/components/seguros/PolizaColumnPicker";
import { POLIZA_STATIC_COLUMNS, usePolizaColumnPrefs, type PolizaColumnDef } from "@/lib/insurers/poliza-columns";
import type { PolizaEstado, PolizaRecord } from "@/lib/insurers/polizas-db";
import type { PolizaRamoCampoRecord } from "@/lib/insurers/poliza-ramo-campos-db";

type PolizaRow = PolizaRecord & { contactName: string | null; contactDocumento: string | null };

type SortKey = "aseguradora" | "ramo" | "numero_poliza" | "vigencia_hasta" | "prima" | "estado";
const SORTABLE_KEYS = new Set<string>(["aseguradora", "ramo", "numero_poliza", "vigencia_hasta", "prima", "estado"]);

type Filter = "todas" | PolizaEstado;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "activa", label: "Activas" },
  { id: "vencida", label: "Vencidas" },
  { id: "cancelada", label: "Canceladas" }
];

const ESTADO_BADGE: Record<PolizaEstado, BadgeVariant> = {
  cotizada: "sky",
  expedicion: "amber",
  activa: "emerald",
  vencida: "danger",
  cancelada: "neutral",
  no_renovada: "orange",
  renovada: "violet",
  devengada: "neutral"
};

const TIPO_POLIZA_LABEL: Record<string, string> = { individual: "Individual", colectiva: "Colectiva", masiva: "Masiva" };

function diasRestantes(vigenciaHasta: string | null): number | null {
  if (!vigenciaHasta) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${vigenciaHasta}T00:00:00`);
  return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
}

function formatMoneda(value: number | null, moneda: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda || "COP", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${moneda} ${value.toLocaleString("es-CO")}`;
  }
}

function renderCustomValue(p: PolizaRow, campo: PolizaRamoCampoRecord): React.ReactNode {
  const raw = p.metadata?.[campo.fieldKey];
  if (raw == null || raw === "") return "—";
  if (campo.fieldType === "boolean") return raw ? "Sí" : "No";
  return String(raw);
}

/** Valor plano para exportar a Excel (ExportMenu exige string|number|boolean, no JSX). */
function rawValue(p: PolizaRow, colKey: string, camposByKey: Map<string, PolizaRamoCampoRecord>): string | number | boolean {
  if (colKey.startsWith("custom:")) {
    const campo = camposByKey.get(colKey.slice(7));
    const raw = campo ? p.metadata?.[campo.fieldKey] : null;
    if (raw == null) return "";
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
    return String(raw);
  }
  switch (colKey) {
    case "tomador": return p.contactName ?? "";
    case "aseguradora": return p.aseguradora;
    case "ramo": return p.ramo;
    case "numero_poliza": return p.numeroPoliza ?? "";
    case "vigencia_desde": return p.vigenciaDesde ?? "";
    case "vigencia_hasta": return p.vigenciaHasta ?? "";
    case "prima": return p.prima ?? "";
    case "moneda": return p.moneda;
    case "tipo_poliza": return TIPO_POLIZA_LABEL[p.tipoPoliza] ?? p.tipoPoliza;
    case "comision_agencia": return p.comisionAgencia ?? "";
    case "comision_vendedor": return p.comisionVendedor ?? "";
    case "estado": return p.estado;
    default: return "";
  }
}

function renderCell(p: PolizaRow, colKey: string, camposByKey: Map<string, PolizaRamoCampoRecord>): React.ReactNode {
  if (colKey.startsWith("custom:")) {
    const campo = camposByKey.get(colKey.slice(7));
    return campo ? renderCustomValue(p, campo) : "—";
  }
  switch (colKey) {
    case "tomador":
      return p.contactName || "—";
    case "aseguradora":
      return (
        <span className="inline-flex items-center gap-2 font-medium text-white">
          <ShieldCheck className="w-4 h-4 text-[#99c9ff] shrink-0" /> {p.aseguradora}
        </span>
      );
    case "ramo":
      return p.ramo;
    case "numero_poliza":
      return <span className="font-mono text-gray-400">{p.numeroPoliza || "—"}</span>;
    case "vigencia_desde":
      return p.vigenciaDesde || "—";
    case "vigencia_hasta": {
      const dias = diasRestantes(p.vigenciaHasta);
      if (!p.vigenciaHasta) return "—";
      return (
        <span className={dias !== null && dias <= 30 && p.estado === "activa" ? "text-amber-300 font-medium" : ""}>
          {p.vigenciaHasta}
          {dias !== null && p.estado === "activa" && (
            <span className="block text-[11px] text-gray-500">{dias < 0 ? `Venció hace ${Math.abs(dias)}d` : `Faltan ${dias}d`}</span>
          )}
        </span>
      );
    }
    case "prima":
      return formatMoneda(p.prima, p.moneda);
    case "moneda":
      return p.moneda;
    case "tipo_poliza":
      return TIPO_POLIZA_LABEL[p.tipoPoliza] ?? p.tipoPoliza;
    case "comision_agencia":
      return formatMoneda(p.comisionAgencia, p.moneda);
    case "comision_vendedor":
      return formatMoneda(p.comisionVendedor, p.moneda);
    case "estado":
      return <Badge variant={ESTADO_BADGE[p.estado]}>{p.estado}</Badge>;
    default:
      return "—";
  }
}

export default function PolizasPage() {
  const { canWrite: canEdit } = useModuleWriteAccess("seguros", "edit");
  const { canWrite: canManage } = useModuleWriteAccess("seguros", "manage");

  const [polizas, setPolizas] = useState<PolizaRow[]>([]);
  const [campos, setCampos] = useState<PolizaRamoCampoRecord[]>([]);
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
  const [softsegurosConectado, setSoftsegurosConectado] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/softseguros/status", { headers });
      if (res.ok) setSoftsegurosConectado((await res.json()).connection?.status === "active");
    })();
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filter !== "todas") params.set("estado", filter);
    if (search.trim()) params.set("q", search.trim());
    const [polRes, camposRes] = await Promise.all([
      fetch(`/api/seguros/polizas?${params.toString()}`, { headers }),
      fetch("/api/seguros/ramo-campos", { headers })
    ]);
    if (polRes.ok) setPolizas((await polRes.json()).polizas ?? []);
    if (camposRes.ok) setCampos((await camposRes.json()).campos ?? []);
    if (!silent) setLoading(false);
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  const camposByKey = useMemo(() => new Map(campos.map(c => [c.fieldKey, c])), [campos]);
  const allColumns: PolizaColumnDef[] = useMemo(
    () => [...POLIZA_STATIC_COLUMNS, ...campos.map(c => ({ key: `custom:${c.fieldKey}`, label: c.label }))],
    [campos]
  );
  const { ready: columnsReady, ordered, visible, hidden, toggle, move } = usePolizaColumnPrefs(allColumns);

  const getSortValue = useCallback((p: PolizaRow, key: SortKey): string | number | null => {
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
            ramo_id: values.ramo_id,
            numero_poliza: values.numero_poliza || null,
            vigencia_desde: values.vigencia_desde || null,
            vigencia_hasta: values.vigencia_hasta || null,
            prima: values.prima === "" ? null : Number(values.prima),
            periodicidad_pago: values.periodicidad_pago || null,
            tipo_poliza: values.tipo_poliza,
            moneda: values.moneda
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
            ramo_id: values.ramo_id,
            numero_poliza: values.numero_poliza || null,
            vigencia_desde: values.vigencia_desde || null,
            vigencia_hasta: values.vigencia_hasta || null,
            prima: values.prima === "" ? null : Number(values.prima),
            periodicidad_pago: values.periodicidad_pago || null,
            tipo_poliza: values.tipo_poliza,
            moneda: values.moneda
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
        title="Pólizas"
        description="Registro operativo de tus pólizas — lo justo para disparar renovaciones y siniestros."
        tabs={<PolizasSubTabs active="polizas" />}
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
            {columnsReady && <PolizaColumnPicker ordered={ordered} hidden={hidden} onToggle={toggle} onMove={move} />}
            <ExportMenu
              filename="polizas"
              sheetName="Pólizas"
              columns={visible.map(col => ({
                header: col.label,
                value: (p: PolizaRow) => rawValue(p, col.key, camposByKey)
              }))}
              rows={sorted}
            />
            {canManage && (
              <Link href="/dashboard/seguros/polizas/campos" className={btnGhost} title="Campos por ramo">
                <Settings className="w-4 h-4" />
              </Link>
            )}
            {canEdit && (softsegurosConectado ? (
              <button type="button" onClick={syncSoftseguros} disabled={syncing} className={btnGhost}>
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizar Softseguros
              </button>
            ) : (
              <Link href="/dashboard/conectores" className={btnGhost} title="Conecta Softseguros para traer tu cartera automáticamente">
                <RefreshCw className="w-4 h-4" /> Conectar Softseguros
              </Link>
            ))}
            {canEdit && (
              <>
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
                ? softsegurosConectado
                  ? "Aún no hay pólizas. Crea una, importa tu Excel o sincroniza Softseguros."
                  : "Aún no hay pólizas. Crea una, importa tu Excel o conecta Softseguros para traerlas automáticamente."
                : "Aún no hay pólizas registradas."}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[1100px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                {visible.map(col =>
                  SORTABLE_KEYS.has(col.key) ? (
                    <SortableTh
                      key={col.key}
                      label={col.label}
                      sortKey={col.key as SortKey}
                      activeKey={sort.key}
                      direction={sort.direction}
                      onSort={toggleSort as (k: string) => void}
                    />
                  ) : (
                    <th key={col.key} className={registryTableHeadCell}>{col.label}</th>
                  )
                )}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(p => (
                <tr key={p.id} className={registryTableRowClickable} onClick={() => setPolizaModal({ poliza: p })}>
                  {visible.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={colIdx === 0 ? registryTableCellFirst : `${registryTableCell} text-sm text-gray-300`}
                    >
                      {renderCell(p, col.key, camposByKey)}
                    </td>
                  ))}
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
              ))}
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
