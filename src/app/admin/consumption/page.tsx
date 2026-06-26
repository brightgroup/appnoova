"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, RefreshCw, DollarSign, Wallet, Activity, TrendingUp,
  ChevronRight, PieChart, Users,
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  adminRegistryPage, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRowClickable, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty,
} from "@/lib/brand-ui";
import { AdminFilterSelect } from "@/components/admin/AdminFilterSelect";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { AdminStatusBadge } from "@/components/admin/admin-table-styles";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import {
  BILLING_CHART_CATEGORIES,
  chartAxisTicks,
  dayTotal,
  niceChartScaleMax,
  type BillingChartDay,
} from "@/lib/billing/chart-categories";
import {
  CONSUMPTION_RANGE_OPTIONS,
  type ConsumptionRangeId,
} from "@/lib/billing/consumption-range";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ServiceCell {
  credits: number;
  cost_usd: number;
  events: number;
}

interface ClientRow {
  organization_id: string;
  name: string;
  plan_id: string | null;
  status: string | null;
  services: Record<string, ServiceCell>;
  total_credits: number;
  total_cost_usd: number;
  total_cost_cop: number;
  total_events: number;
}

interface ConsumptionData {
  trm_cop?: number;
  credit_usd_value?: number;
  range: { id: string; label: string; from: string; to: string };
  totals: {
    events: number;
    credits: number;
    cost_usd: number;
    cost_cop: number;
    twilio_cost_usd: number;
    google_cost_usd: number;
    telnyx_cost_usd: number;
    elevenlabs_cost_usd: number;
  };
  by_service: { key: string; label: string; color: string; credits: number; cost_usd: number; events: number }[];
  daily_chart: BillingChartDay[];
  daily_cost_chart: BillingChartDay[];
  daily_cost_usd: { dateKey: string; dayLabel: string; cost_usd: number }[];
  clients: ClientRow[];
}

const SERVICE_FILTER_OPTIONS = [
  { value: "todos", label: "Todos los servicios" },
  ...BILLING_CHART_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
];

const RANGE_FILTER_OPTIONS = CONSUMPTION_RANGE_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label,
}));

const CHART_TABS = [
  { id: "credits", label: "Consumo por canal" },
  { id: "costs", label: "Costos" },
] as const;

const PAGE_TABS = [
  { id: "summary", label: "Resumen", icon: PieChart },
  { id: "clients", label: "Consumo por cliente", icon: Users },
] as const;

type ChartTabId = (typeof CHART_TABS)[number]["id"];
type PageTabId = (typeof PAGE_TABS)[number]["id"];

const fmtN = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
const fmtUsdShort = (n: number) =>
  n >= 1 ? fmtUsd(n) : `$${n.toFixed(4)}`;
const cop = (n: number) => "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));

function ServiceCellDisplay({ cell }: { cell: ServiceCell | undefined }) {
  if (!cell || (cell.credits === 0 && cell.cost_usd === 0)) {
    return <span className="text-gray-600">—</span>;
  }
  return (
    <div className="tabular-nums">
      <p className="text-sm text-white font-medium">{fmtN(cell.credits)} <span className="text-gray-500 font-normal text-xs">cr</span></p>
      <p className="text-xs text-amber-300/90">{fmtUsdShort(cell.cost_usd)}</p>
    </div>
  );
}

function DailyStackedChart({
  days,
  activeCategories,
  scaleMax,
  ticks,
  valueLabel,
  formatValue,
  hoverDay,
  onHoverDay,
}: {
  days: BillingChartDay[];
  activeCategories: typeof BILLING_CHART_CATEGORIES;
  scaleMax: number;
  ticks: number[];
  valueLabel: string;
  formatValue: (n: number) => string;
  hoverDay: BillingChartDay | null;
  onHoverDay: (day: BillingChartDay | null) => void;
}) {
  if (days.length === 0) return null;

  const hoverTotal = hoverDay ? dayTotal(hoverDay) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mt-0.5">
            {hoverDay
              ? `${hoverDay.dayLabel} · ${formatValue(hoverTotal)}`
              : valueLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {activeCategories.map((c) => (
            <span key={c.key} className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col justify-between text-[10px] text-gray-600 h-40 shrink-0 w-12 text-right">
          {ticks.slice().reverse().map((t) => (
            <span key={t}>
              {scaleMax < 10 ? t.toFixed(2) : t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}
            </span>
          ))}
        </div>
        <div className="flex-1 flex items-end gap-0.5 h-40 min-w-0 overflow-x-auto pb-1">
          {days.map((day) => {
            const total = dayTotal(day);
            const hPct = scaleMax > 0 ? (total / scaleMax) * 100 : 0;
            return (
              <div
                key={day.dateKey}
                className="flex-1 min-w-[6px] max-w-[20px] flex flex-col justify-end h-full group cursor-default"
                onMouseEnter={() => onHoverDay(day)}
                onMouseLeave={() => onHoverDay(null)}
              >
                <div
                  className="w-full flex flex-col justify-end rounded-t overflow-hidden"
                  style={{ height: `${hPct}%`, minHeight: total > 0 ? 2 : 0 }}
                >
                  {activeCategories.map((c) => {
                    const seg = day[c.key];
                    if (seg <= 0) return null;
                    const segPct = total > 0 ? (seg / total) * 100 : 0;
                    return (
                      <div key={c.key} style={{ height: `${segPct}%`, backgroundColor: c.color }} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Componente ──────────────────────────────────────────────────────────────────

export default function AdminConsumptionPage() {
  const router = useRouter();
  const [data, setData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<ConsumptionRangeId>("30d");
  const [serviceFilter, setServiceFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [pageTab, setPageTab] = useState<PageTabId>("summary");
  const [chartTab, setChartTab] = useState<ChartTabId>("credits");
  const [hoverCreditsDay, setHoverCreditsDay] = useState<BillingChartDay | null>(null);
  const [hoverCostDay, setHoverCostDay] = useState<BillingChartDay | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch(`/api/admin/billing/consumption?range=${range}`);
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setData(json);
    setLoading(false);
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.clients ?? []).filter((c) => {
      const matchesSearch =
        q === "" ||
        c.name.toLowerCase().includes(q) ||
        (c.plan_id ?? "").toLowerCase().includes(q) ||
        (c.status ?? "").toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (serviceFilter === "todos") return c.total_credits > 0 || c.total_cost_usd > 0;
      const cell = c.services[serviceFilter];
      return cell && (cell.credits > 0 || cell.cost_usd > 0);
    });
  }, [data?.clients, search, serviceFilter]);

  const pag = useRegistryPagination(filteredClients.length, `${range}-${serviceFilter}-${search}`);
  const pageRows = pag.pageRows(filteredClients);

  const creditChart = data?.daily_chart ?? [];
  const costChart = data?.daily_cost_chart ?? [];

  const creditChartScaleMax = useMemo(() => {
    const maxDay = Math.max(...creditChart.map(dayTotal), 0);
    return niceChartScaleMax(Math.max(maxDay, 1));
  }, [creditChart]);

  const costChartScaleMax = useMemo(() => {
    const maxDay = Math.max(...costChart.map(dayTotal), 0);
    return niceChartScaleMax(Math.max(maxDay, 0.0001), 0.01);
  }, [costChart]);

  const creditChartTicks = useMemo(() => chartAxisTicks(creditChartScaleMax, 4), [creditChartScaleMax]);
  const costChartTicks = useMemo(() => {
    const step = costChartScaleMax / 4;
    return Array.from({ length: 5 }, (_, i) => step * i);
  }, [costChartScaleMax]);

  const activeCreditCategories = useMemo(
    () => BILLING_CHART_CATEGORIES.filter((c) => creditChart.some((d) => d[c.key] > 0)),
    [creditChart]
  );

  const activeCostCategories = useMemo(
    () => BILLING_CHART_CATEGORIES.filter((c) => costChart.some((d) => d[c.key] > 0)),
    [costChart]
  );

  const totals = data?.totals;

  const visibleServiceCols =
    serviceFilter === "todos"
      ? BILLING_CHART_CATEGORIES.filter((c) =>
          filteredClients.some((row) => {
            const cell = row.services[c.key];
            return cell && (cell.credits > 0 || cell.cost_usd > 0);
          })
        )
      : BILLING_CHART_CATEGORIES.filter((c) => c.key === serviceFilter);

  const hasChartData = creditChart.some((d) => dayTotal(d) > 0) || costChart.some((d) => dayTotal(d) > 0);

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={BarChart3}
        title="Control de consumo"
        subtitle={
          data
            ? `${data.clients.length} clientes con consumo · ${data.range.label}`
            : "Costo real por cliente y servicio"
        }
        onRefresh={load}
        refreshing={loading}
      />

      <div className="flex gap-0 border-b border-white/[.08] px-5 text-sm shrink-0">
        {PAGE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPageTab(t.id)}
              className={`flex items-center gap-2 px-4 pb-3 pt-2 font-medium border-b-2 transition-colors ${
                pageTab === t.id
                  ? "text-white border-[#5b5bf6]"
                  : "text-gray-400 border-transparent hover:text-gray-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={adminRegistryContent}>
        {error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300 mb-4">
            {error}
          </div>
        )}

        {pageTab === "summary" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-white/[.06]">
              <AdminFilterSelect
                label="Período"
                value={range}
                onChange={(v) => setRange(v as ConsumptionRangeId)}
                options={RANGE_FILTER_OPTIONS}
              />
              <AdminFilterSelect
                label="Servicio"
                value={serviceFilter}
                onChange={setServiceFilter}
                options={SERVICE_FILTER_OPTIONS}
              />
            </div>

            {loading && !data ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando resumen…
              </div>
            ) : (
              <>
                {totals && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                        <DollarSign className="w-3 h-3" /> Costo real (USD)
                      </p>
                      <p className="text-xl font-bold text-amber-300">{fmtUsd(totals.cost_usd)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{cop(totals.cost_cop)} COP</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                        <Wallet className="w-3 h-3" /> Créditos consumidos
                      </p>
                      <p className="text-xl font-bold">{fmtN(totals.credits)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmtN(totals.events)} eventos</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                        <TrendingUp className="w-3 h-3" /> Por proveedor (USD)
                      </p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex justify-between text-gray-400"><span>Twilio</span><span className="text-amber-300">{fmtUsdShort(totals.twilio_cost_usd)}</span></div>
                        <div className="flex justify-between text-gray-400"><span>Google</span><span className="text-amber-300">{fmtUsdShort(totals.google_cost_usd)}</span></div>
                        <div className="flex justify-between text-gray-400"><span>Telnyx</span><span className="text-amber-300">{fmtUsdShort(totals.telnyx_cost_usd)}</span></div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                        <Activity className="w-3 h-3" /> Clientes activos
                      </p>
                      <p className="text-xl font-bold">{data?.clients.length ?? 0}</p>
                      <p className="text-xs text-gray-500 mt-0.5">con consumo en el rango</p>
                    </div>
                  </div>
                )}

                {data && data.by_service.length > 0 && (
                  <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Por servicio</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                      {data.by_service.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setServiceFilter(serviceFilter === s.key ? "todos" : s.key)}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            serviceFilter === s.key
                              ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10"
                              : "border-white/[.06] bg-white/[.02] hover:bg-white/[.04]"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-xs font-medium text-gray-300">{s.label}</span>
                          </div>
                          <p className="text-sm font-bold text-white">{fmtN(s.credits)} <span className="text-gray-500 font-normal text-xs">cr</span></p>
                          <p className="text-xs text-amber-300 mt-0.5">{fmtUsdShort(s.cost_usd)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasChartData && (
                  <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <p className="text-sm font-semibold text-white">Evolución diaria</p>
                      <div className="flex gap-0 text-sm border-b border-white/[.06]">
                        {CHART_TABS.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setChartTab(t.id)}
                            className={`px-3 pb-2 pt-0.5 font-medium transition-colors border-b-2 whitespace-nowrap ${
                              chartTab === t.id
                                ? "text-white border-[#5b5bf6]"
                                : "text-gray-400 border-transparent hover:text-gray-200"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {chartTab === "credits" ? (
                      <DailyStackedChart
                        days={creditChart}
                        activeCategories={activeCreditCategories}
                        scaleMax={creditChartScaleMax}
                        ticks={creditChartTicks}
                        valueLabel={data?.range.label ?? ""}
                        formatValue={(n) => `${fmtN(n)} cr`}
                        hoverDay={hoverCreditsDay}
                        onHoverDay={setHoverCreditsDay}
                      />
                    ) : (
                      <DailyStackedChart
                        days={costChart}
                        activeCategories={activeCostCategories}
                        scaleMax={costChartScaleMax}
                        ticks={costChartTicks}
                        valueLabel={data?.range.label ?? ""}
                        formatValue={(n) => fmtUsdShort(n)}
                        hoverDay={hoverCostDay}
                        onHoverDay={setHoverCostDay}
                      />
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-600 text-center">
                  1 crédito = ${data?.credit_usd_value ?? 0.0003} USD · TRM ref. ${fmtN(data?.trm_cop ?? 0)} COP/USD · Costo USD = suma de provider_cost_usd en usage_events
                </p>
              </>
            )}
          </div>
        )}

        {pageTab === "clients" && (
          <RegistryTableLayout
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar cliente, plan o estado…"
            onRefresh={load}
            refreshing={loading}
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <AdminFilterSelect
                  label="Período"
                  value={range}
                  onChange={(v) => setRange(v as ConsumptionRangeId)}
                  options={RANGE_FILTER_OPTIONS}
                />
                <AdminFilterSelect
                  label="Servicio"
                  value={serviceFilter}
                  onChange={setServiceFilter}
                  options={SERVICE_FILTER_OPTIONS}
                />
              </div>
            }
            footer={filteredClients.length > 0 ? (
              <RegistryTablePagination
                {...pag}
                onPageChange={pag.setPage}
                onPageSizeChange={pag.setPageSize}
                label="clientes"
              />
            ) : undefined}
          >
            {loading && !data ? (
              <div className={registryTableLoading}>
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…
              </div>
            ) : filteredClients.length === 0 ? (
              <div className={registryTableEmpty}>
                {data?.clients.length === 0
                  ? "Sin consumo en este rango de fechas."
                  : "Sin resultados para este filtro."}
              </div>
            ) : (
              <table className={registryTable}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Cliente</th>
                    <th className={registryTableHeadCell}>Plan</th>
                    <th className={registryTableHeadCell}>Estado</th>
                    {visibleServiceCols.map((c) => (
                      <th key={c.key} className={registryTableHeadCell}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.label}
                        </span>
                      </th>
                    ))}
                    <th className={`${registryTableHeadCell} text-right`}>Total cr</th>
                    <th className={`${registryTableHeadCell} text-right`}>Costo USD</th>
                    <th className={registryTableHeadCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.organization_id}
                      className={registryTableRowClickable}
                      onClick={() => router.push(`/admin/billing/${row.organization_id}`)}
                    >
                      <td className={registryTableCellFirst}>
                        <p className="text-sm font-medium text-white">{row.name}</p>
                        <p className="text-xs text-gray-600">{fmtN(row.total_events)} eventos</p>
                      </td>
                      <td className={`${registryTableCellMuted} capitalize`}>{row.plan_id ?? "—"}</td>
                      <td className={registryTableCell}>
                        <AdminStatusBadge status={row.status} />
                      </td>
                      {visibleServiceCols.map((c) => (
                        <td key={c.key} className={registryTableCell}>
                          <ServiceCellDisplay cell={row.services[c.key]} />
                        </td>
                      ))}
                      <td className={`${registryTableCell} text-right font-bold text-white tabular-nums`}>
                        {fmtN(row.total_credits)}
                      </td>
                      <td className={`${registryTableCell} text-right font-bold text-amber-300 tabular-nums`}>
                        {fmtUsdShort(row.total_cost_usd)}
                        <p className="text-[10px] text-gray-500 font-normal">{cop(row.total_cost_cop)}</p>
                      </td>
                      <td className={registryTableCell}>
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        )}
      </div>
    </div>
  );
}
