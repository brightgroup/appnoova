"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw, TrendingUp, DollarSign, Wallet, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  adminRegistryPage, registryToolbar, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRowClickable, registryTableCell, registryTableCellFirst,
  registryTableLoading, registryTableEmpty, textMuted
} from "@/lib/brand-ui";

// ── Interfaces ────────────────────────────────────────────────────────────────

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

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  trialing:  "bg-blue-500/15 text-blue-300",
  active:    "bg-green-500/15 text-green-300",
  past_due:  "bg-amber-500/15 text-amber-300",
  suspended: "bg-red-500/15 text-red-300",
  canceled:  "bg-gray-500/15 text-gray-400",
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const cop = (n: number) => "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));
const num = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Componente ────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const router = useRouter();
  const [rows,   setRows]   = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const res  = await authFetch("/api/admin/billing");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else { setRows(json.rows ?? []); setTotals(json.totals ?? null); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className={adminRegistryPage}>

      {/* Toolbar */}
      <div className={`${registryToolbar} flex items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CreditCard className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Facturación</h1>
          </div>
          <p className={`text-xs ${textMuted}`}>Consumo, costo real y margen por cliente · periodo vigente</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.06]" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className={adminRegistryContent}>
        {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300 mb-5">{error}</div>}

        {/* Totales globales */}
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
              <p className="text-xs text-gray-500 mt-0.5">proveedores</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 flex items-center gap-1.5 mb-1.5 font-medium uppercase tracking-wide">
                <TrendingUp className="w-3 h-3" /> Margen
              </p>
              <p className={`text-xl font-bold ${totals.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(totals.margin_cop)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{totals.margin_pct != null ? `${totals.margin_pct}%` : "—"}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
              <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Por proveedor</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between text-gray-400"><span>WhatsApp/Twilio</span><span>{cop(totals.twilio_cost_cop)}</span></div>
                <div className="flex justify-between text-gray-400"><span>IA/Google</span><span>{cop(totals.google_cost_cop)}</span></div>
                <div className="flex justify-between text-gray-400"><span>Voz/Telnyx</span><span>{cop(totals.telnyx_cost_cop)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tabla de clientes */}
        {loading ? (
          <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
        ) : rows.length === 0 ? (
          <div className={registryTableEmpty}>Sin clientes aún</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[.08]">
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
                {rows.map(r => (
                  <tr
                    key={r.organization_id}
                    className={registryTableRowClickable}
                    onClick={() => router.push(`/admin/billing/${r.organization_id}`)}
                  >
                    <td className={registryTableCellFirst}>
                      <p className="text-sm font-medium text-white">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.owner_email ?? r.slug}</p>
                    </td>
                    <td className={`${registryTableCell} capitalize text-gray-300`}>{r.plan_id ?? "—"}</td>
                    <td className={registryTableCell}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[r.status ?? ""] ?? "bg-gray-500/15 text-gray-400"}`}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-gray-400`}>{fmtDate(r.period_end)}</td>
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
                    <td className={`${registryTableCell} font-medium text-white`}>{cop(r.revenue_cop)}</td>
                    <td className={`${registryTableCell} text-amber-300`}>{cop(r.cost_cop)}</td>
                    <td className={registryTableCell}>
                      <span className={r.margin_cop >= 0 ? "text-green-300" : "text-red-300"}>
                        {cop(r.margin_cop)}
                        {r.margin_pct != null && <span className="text-xs text-gray-500 ml-1">({r.margin_pct}%)</span>}
                      </span>
                    </td>
                    <td className={registryTableCell}>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
