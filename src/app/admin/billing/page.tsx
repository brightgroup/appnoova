"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw, TrendingUp, DollarSign, Wallet, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { AdminStatusBadge } from "@/components/admin/admin-table-styles";
import {
  adminRegistryPage, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRowClickable, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty,
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";

interface Row {
  organization_id: string;
  name: string;
  slug: string;
  owner_email: string | null;
  plan_id: string | null;
  status: string | null;
  period_end: string | null;
  price_usd: number;
  revenue_cop: number;
  included_credits: number;
  used_credits: number;
  used_pct: number;
  cost_cop: number;
  margin_cop: number;
  margin_pct: number | null;
}

interface Totals {
  mrr_usd: number;
  revenue_cop: number;
  cost_cop: number;
  margin_cop: number;
  margin_pct: number | null;
  twilio_cost_cop: number;
  google_cost_cop: number;
  telnyx_cost_cop: number;
}

const cop = (n: number) => "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));
const num = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AdminBillingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/admin/billing");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else {
      setRows(json.rows ?? []);
      setTotals(json.totals ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      (r.owner_email ?? "").toLowerCase().includes(q) ||
      (r.plan_id ?? "").toLowerCase().includes(q)
    );
  }), [rows, search]);

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={CreditCard}
        title="Facturación"
        subtitle={`${rows.length} clientes · periodo vigente`}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar cliente, plan o email…"
        onRefresh={load}
        refreshing={loading}
      />

      <div className={adminRegistryContent}>
        {totals && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                <DollarSign className="w-3 h-3" /> MRR
              </p>
              <p className="text-xl font-bold">${num(totals.mrr_usd)}<span className="text-sm text-gray-500 font-normal">/mes</span></p>
              <p className="text-xs text-gray-500 mt-0.5">{cop(totals.revenue_cop)} COP</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                <Wallet className="w-3 h-3" /> Costo real
              </p>
              <p className="text-xl font-bold text-amber-300">{cop(totals.cost_cop)}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                <TrendingUp className="w-3 h-3" /> Margen
              </p>
              <p className={`text-xl font-bold ${totals.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(totals.margin_cop)}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Por proveedor</p>
              <div className="space-y-0.5 text-xs text-gray-400">
                <div className="flex justify-between"><span>Twilio</span><span>{cop(totals.twilio_cost_cop)}</span></div>
                <div className="flex justify-between"><span>Google</span><span>{cop(totals.google_cost_cop)}</span></div>
                <div className="flex justify-between"><span>Telnyx</span><span>{cop(totals.telnyx_cost_cop)}</span></div>
              </div>
            </div>
          </div>
        )}

        <RegistryTableLayout
          error={error || undefined}
          footer={filtered.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="clientes"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className={registryTableEmpty}>Sin clientes</div>
          ) : (
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Cliente</th>
                  <th className={registryTableHeadCell}>Plan</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Renovación</th>
                  <th className={registryTableHeadCell}>Créditos</th>
                  <th className={registryTableHeadCell}>Le facturo</th>
                  <th className={registryTableHeadCell}>Mi costo</th>
                  <th className={registryTableHeadCell}>Margen</th>
                  <th className={registryTableHeadCell}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.organization_id}
                    className={registryTableRowClickable}
                    onClick={() => router.push(`/admin/billing/${r.organization_id}`)}
                  >
                    <td className={registryTableCellFirst}>
                      <p className="text-sm font-medium text-white">{r.name}</p>
                      <p className="text-xs text-gray-600">{r.owner_email ?? r.slug}</p>
                    </td>
                    <td className={`${registryTableCellMuted} capitalize`}>{r.plan_id ?? "—"}</td>
                    <td className={registryTableCell}>
                      <AdminStatusBadge status={r.status} />
                    </td>
                    <td className={registryTableCellMuted}>{fmtDate(r.period_end)}</td>
                    <td className={registryTableCell}>
                      <div className="w-24">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>{num(r.used_credits)}</span>
                          <span>{num(r.included_credits)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden">
                          <div
                            className={`h-full ${r.used_pct >= 90 ? "bg-red-500" : r.used_pct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`}
                            style={{ width: `${r.used_pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`${registryTableCell} text-sm font-medium text-white`}>{cop(r.revenue_cop)}</td>
                    <td className={`${registryTableCell} text-sm text-amber-300`}>{cop(r.cost_cop)}</td>
                    <td className={registryTableCell}>
                      <span className={r.margin_cop >= 0 ? "text-green-300" : "text-red-300"}>
                        {cop(r.margin_cop)}
                      </span>
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
      </div>
    </div>
  );
}
