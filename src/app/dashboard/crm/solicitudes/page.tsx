"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownWideNarrow,
  Car,
  ChevronLeft,
  Filter,
  HeartPulse,
  Home,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck
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
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ExportColumn } from "@/lib/export-table";
import { PlateBadge } from "@/components/crm/PlateBadge";

interface Solicitud {
  id: string;
  ramo: string;
  placa: string | null;
  tomador: { nombre_tomador?: string; documento_tomador?: string };
  leadId: string | null;
  createdAt: string;
  updatedAt: string;
}

type RamoFiltro = "todos" | "autos" | "vida" | "hogar" | "salud";
type SortField = "llegada" | "alfabetico";
type SortDirection = "asc" | "desc";

const RAMO_LABEL: Record<string, string> = { autos: "Auto", vida: "Vida", hogar: "Hogar", salud: "Salud" };
const RAMO_ICON: Record<string, typeof Car> = { autos: Car, vida: HeartPulse, hogar: Home, salud: HeartPulse };
const RAMO_OPTIONS: Array<{ value: RamoFiltro; label: string }> = [
  { value: "todos", label: "Todos los ramos" },
  { value: "autos", label: "Auto" },
  { value: "vida", label: "Vida" },
  { value: "hogar", label: "Hogar" },
  { value: "salud", label: "Salud" }
];

function DirectionPills({ active, onSelect }: { active: SortDirection | null; onSelect: (dir: SortDirection) => void }) {
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
              <DirectionPills active={sortField === "llegada" ? sortDirection : null} onSelect={dir => onChange("llegada", dir)} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Alfabéticamente</p>
              <DirectionPills active={sortField === "alfabetico" ? sortDirection : null} onSelect={dir => onChange("alfabetico", dir)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FiltroPopover({ ramo, onRamoChange }: { ramo: RamoFiltro; onRamoChange: (v: RamoFiltro) => void }) {
  const [open, setOpen] = useState(false);
  const isDefault = ramo === "todos";

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
                onClick={() => onRamoChange("todos")}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar
              </button>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Ramo</p>
              <NoovaSelect value={ramo} onChange={v => onRamoChange(v as RamoFiltro)} options={RAMO_OPTIONS} allowEmpty={false} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Solicitudes = cotizaciones de seguro que todavía están reuniendo datos
 * (estado "pendiente" en insurance_quote_requests) — entidad propia para
 * quien quiera verlas sin entrar al lead, con el mismo diseño de tabla que
 * el resto de listados (ver Leads). Una vez tienen resultado, la misma fila
 * pasa a mostrarse en Cotizaciones (ver /dashboard/crm/cotizaciones).
 */
export default function SolicitudesPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ramo, setRamo] = useState<RamoFiltro>("todos");
  const [sortField, setSortField] = useState<SortField>("llegada");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/cotizaciones?estado=pendiente", { headers });
    if (res.ok) setSolicitudes((await res.json()).requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = solicitudes;
    if (ramo !== "todos") rows = rows.filter(r => r.ramo === ramo);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        [r.tomador?.nombre_tomador, r.tomador?.documento_tomador, r.placa, RAMO_LABEL[r.ramo] ?? r.ramo]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      );
    }
    const sorted = [...rows].sort((a, b) => {
      if (sortField === "alfabetico") {
        return (a.tomador?.nombre_tomador ?? "").localeCompare(b.tomador?.nombre_tomador ?? "");
      }
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });
    if (sortDirection === "desc") sorted.reverse();
    return sorted;
  }, [solicitudes, ramo, search, sortField, sortDirection]);

  const pagination = useRegistryPagination(filtered.length, `${ramo}-${search}-${sortField}-${sortDirection}`);
  const pageRows = pagination.pageRows(filtered);

  const exportColumns = useMemo<ExportColumn<Solicitud>[]>(
    () => [
      { header: "Ramo", value: r => RAMO_LABEL[r.ramo] ?? r.ramo },
      { header: "Tomador", value: r => r.tomador?.nombre_tomador ?? "" },
      { header: "Documento", value: r => r.tomador?.documento_tomador ?? "" },
      { header: "Placa", value: r => r.placa ?? "" },
      { header: "Creada", value: r => r.createdAt },
      { header: "Actualizada", value: r => r.updatedAt }
    ],
    []
  );

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Solicitudes</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Cotizaciones en curso — reuniendo los datos del ramo antes de tener un precio real</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
        <RegistryTableLayout
          onRefresh={() => load()}
          refreshing={loading}
          filters={
            <div className="flex items-center gap-2 flex-wrap">
              <FiltroPopover ramo={ramo} onRamoChange={setRamo} />
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
                  placeholder="Buscar por tomador, documento o placa"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={inputSearch}
                />
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <ExportMenu filename="solicitudes" sheetName="Solicitudes" columns={exportColumns} rows={filtered} />
                <Link href="/dashboard/crm/solicitudes/nueva" className={`${btnPrimary} !text-xs gap-1.5`}>
                  <Plus className="w-3.5 h-3.5" /> Nueva solicitud
                </Link>
              </div>
            </div>
          }
          footer={
            !loading && filtered.length > 0 ? (
              <RegistryTablePagination
                total={pagination.total}
                rangeStart={pagination.rangeStart}
                rangeEnd={pagination.rangeEnd}
                pageSafe={pagination.pageSafe}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                label="solicitudes"
              />
            ) : undefined
          }
        >
          {loading ? (
            <div className={registryTableLoading}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando solicitudes…
            </div>
          ) : filtered.length === 0 ? (
            <div className={registryTableEmpty}>No hay solicitudes con estos filtros.</div>
          ) : (
            <table className={`${registryTable} min-w-[720px]`}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Ramo</th>
                  <th className={registryTableHeadCell}>Tomador</th>
                  <th className={registryTableHeadCell}>Documento</th>
                  <th className={registryTableHeadCell}>Actualizada</th>
                  <th className={`${registryTableHeadCell} text-center`}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(s => {
                  const RamoIcon = RAMO_ICON[s.ramo] ?? ShieldCheck;
                  return (
                    <tr
                      key={s.id}
                      className={registryTableRowClickable}
                      onClick={() => router.push(`/dashboard/crm/solicitudes/${s.id}`)}
                    >
                      <td className={`${registryTableCellFirst} text-sm font-medium text-white`}>
                        <span className="inline-flex items-center gap-2">
                          <RamoIcon className="w-4 h-4 text-[#6f95f2]" />
                          {RAMO_LABEL[s.ramo] ?? s.ramo}
                          {s.placa && <PlateBadge plate={s.placa} />}
                        </span>
                      </td>
                      <td className={`${registryTableCell} text-xs text-gray-300`}>{s.tomador?.nombre_tomador ?? "—"}</td>
                      <td className={`${registryTableCell} text-xs text-gray-400 font-mono`}>{s.tomador?.documento_tomador ?? "—"}</td>
                      <td className={`${registryTableCell} text-xs text-gray-500`}>{formatDateTime(s.updatedAt)}</td>
                      <td className={`${registryTableCell} text-center`}>
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Reuniendo datos
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>
      </div>
    </div>
  );
}
