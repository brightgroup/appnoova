"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard, RefreshCw, TrendingUp, DollarSign, Wallet, X, CheckCircle2
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  adminRegistryPage, registryToolbar, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableLoading, registryTableEmpty, textMuted
} from "@/lib/brand-ui";

interface Row {
  organization_id: string;
  name: string;
  slug: string;
  org_status: string;
  owner_email: string | null;
  plan_id: string | null;
  status: string | null;
  period_end: string | null;
  trial_ends_at: string | null;
  price_usd: number;
  revenue_cop: number;
  included_credits: number;
  used_credits: number;
  remaining_credits: number;
  used_pct: number;
  credits_charged: number;
  cost_cop: number;
  twilio_cost_cop: number;
  google_cost_cop: number;
  telnyx_cost_cop: number;
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

interface Invoice {
  id: string;
  period_start: string;
  due_date: string;
  amount_usd: number;
  amount_cop: number;
  status: string;
}

interface DetailData {
  organization: { name: string } | null;
  subscription: Record<string, unknown> | null;
  wallet: Record<string, unknown> | null;
  usage: { event_type: string; events: number; credits: number; cost_cop: number }[];
  invoices: Invoice[];
  recent_events: { id: number; event_type: string; channel: string; credits_charged: number; provider: string; provider_cost_cop: number; total_tokens: number | null; created_at: string }[];
}

const STATUS_BADGE: Record<string, string> = {
  trialing: "bg-blue-500/20 text-blue-300",
  active: "bg-green-500/20 text-green-300",
  past_due: "bg-amber-500/20 text-amber-300",
  suspended: "bg-red-500/20 text-red-300",
  canceled: "bg-gray-500/20 text-gray-300"
};

const INVOICE_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300",
  paid: "bg-green-500/20 text-green-300",
  overdue: "bg-red-500/20 text-red-300",
  void: "bg-gray-500/20 text-gray-300"
};

const EVENT_LABELS: Record<string, string> = {
  ori: "ORI", milink: "Mi Link", widget: "Widget", text_test: "Prueba agentes",
  whatsapp_ai: "WhatsApp IA", whatsapp_manual: "WhatsApp manual", voice: "Voz",
  doc_scan: "Documentos", form_fill: "Formularios", quote: "Cotizaciones"
};

function cop(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO").format(Math.round(n));
}
function num(n: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(n));
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminBillingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOrg, setDetailOrg] = useState<Row | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (row: Row) => {
    setDetailOrg(row);
    setDetail(null);
    setDetailLoading(true);
    const res = await authFetch(`/api/admin/billing/${row.organization_id}`);
    const json = await res.json();
    if (res.ok) setDetail(json);
    setDetailLoading(false);
  }, []);

  const markPaid = useCallback(async (invoiceId: string, row: Row | null) => {
    setPayingId(invoiceId);
    const res = await authFetch(`/api/admin/billing/invoices/${invoiceId}/pay`, { method: "POST" });
    if (!res.ok) alert((await res.json()).error ?? "Error");
    if (row) await openDetail(row);
    await load();
    setPayingId(null);
  }, [openDetail, load]);

  return (
    <div className={adminRegistryPage}>
      <div className={`${registryToolbar} flex items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Facturación</h1>
          </div>
          <p className={`text-xs ${textMuted}`}>Consumo, costo real y margen por cliente · periodo vigente</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/[.08]" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className={adminRegistryContent}>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 mb-4">{error}</div>}

        {/* Totales */}
        {totals && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5" /> MRR</p>
              <p className="text-xl font-bold">${num(totals.mrr_usd)}<span className="text-sm text-gray-500"> /mes</span></p>
              <p className="text-xs text-gray-500">{cop(totals.revenue_cop)} COP</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><Wallet className="w-3.5 h-3.5" /> Costo real</p>
              <p className="text-xl font-bold text-amber-300">{cop(totals.cost_cop)}</p>
              <p className="text-xs text-gray-500">proveedores este periodo</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-1"><TrendingUp className="w-3.5 h-3.5" /> Margen</p>
              <p className={`text-xl font-bold ${totals.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(totals.margin_cop)}</p>
              <p className="text-xs text-gray-500">{totals.margin_pct != null ? `${totals.margin_pct}% del ingreso` : "—"}</p>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-noova-surface p-4">
              <p className="text-xs text-gray-400 mb-1">Costo por proveedor</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">WhatsApp/Twilio</span><span>{cop(totals.twilio_cost_cop)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">IA/Google</span><span>{cop(totals.google_cost_cop)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Voz/Telnyx</span><span>{cop(totals.telnyx_cost_cop)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tabla por cliente */}
        {loading ? (
          <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
        ) : rows.length === 0 ? (
          <div className={registryTableEmpty}>Sin clientes</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[.08]">
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Cliente</th>
                  <th className={registryTableHeadCell}>Plan</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Facturación</th>
                  <th className={registryTableHeadCell}>Créditos</th>
                  <th className={registryTableHeadCell}>Le facturo</th>
                  <th className={registryTableHeadCell}>Mi costo</th>
                  <th className={registryTableHeadCell}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.organization_id} className={`${registryTableRow} cursor-pointer`} onClick={() => openDetail(r)}>
                    <td className={registryTableCellFirst}>
                      <p className="text-sm font-medium text-white">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.owner_email ?? r.slug}</p>
                    </td>
                    <td className={`${registryTableCell} capitalize`}>{r.plan_id ?? "—"}</td>
                    <td className={registryTableCell}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[r.status ?? ""] ?? "bg-gray-500/20 text-gray-300"}`}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-gray-300`}>{fmtDate(r.period_end)}</td>
                    <td className={registryTableCell}>
                      <div className="w-28">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{num(r.used_credits)}</span>
                          <span>{num(r.included_credits)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[.08] overflow-hidden">
                          <div className={`h-full ${r.used_pct >= 90 ? "bg-red-500" : r.used_pct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`} style={{ width: `${r.used_pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`${registryTableCell} font-medium`}>{cop(r.revenue_cop)}</td>
                    <td className={`${registryTableCell} text-amber-300`}>{cop(r.cost_cop)}</td>
                    <td className={registryTableCell}>
                      <span className={r.margin_cop >= 0 ? "text-green-300" : "text-red-300"}>
                        {cop(r.margin_cop)} {r.margin_pct != null && <span className="text-xs text-gray-500">({r.margin_pct}%)</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalle */}
      {detailOrg && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDetailOrg(null)}>
          <div className="w-full max-w-xl h-full bg-[#12131a] border-l border-white/[.1] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#12131a] flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
              <div>
                <h2 className="text-lg font-semibold">{detailOrg.name}</h2>
                <p className="text-xs text-gray-500">{detailOrg.owner_email}</p>
              </div>
              <button onClick={() => setDetailOrg(null)} className="p-1.5 rounded-lg hover:bg-white/[.08] text-gray-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading || !detail ? (
                <div className="flex items-center justify-center py-12 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Le facturo</p>
                      <p className="font-bold">{cop(detailOrg.revenue_cop)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Mi costo</p>
                      <p className="font-bold text-amber-300">{cop(detailOrg.cost_cop)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[.08] p-3">
                      <p className="text-xs text-gray-400">Margen</p>
                      <p className={`font-bold ${detailOrg.margin_cop >= 0 ? "text-green-300" : "text-red-300"}`}>{cop(detailOrg.margin_cop)}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Consumo del periodo</h3>
                    {detail.usage.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin consumo aún.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...detail.usage].sort((a, b) => b.cost_cop - a.cost_cop).map((u) => (
                          <div key={u.event_type} className="flex items-center justify-between text-sm py-1.5 border-b border-white/[.05]">
                            <span>{EVENT_LABELS[u.event_type] ?? u.event_type} <span className="text-xs text-gray-500">×{num(u.events)}</span></span>
                            <span className="text-gray-300">Cobro {num(u.credits)} · <span className="text-amber-300">costo {cop(u.cost_cop)}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Facturas</h3>
                    {detail.invoices.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin facturas (plan gratuito o de prueba).</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.invoices.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/[.08] p-3">
                            <div>
                              <p className="text-sm">{fmtDate(inv.period_start)} · ${inv.amount_usd}</p>
                              <p className="text-xs text-gray-500">Vence {fmtDate(inv.due_date)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_BADGE[inv.status] ?? "bg-gray-500/20 text-gray-300"}`}>{inv.status}</span>
                              {(inv.status === "pending" || inv.status === "overdue") && (
                                <button
                                  onClick={() => markPaid(inv.id, detailOrg)}
                                  disabled={payingId === inv.id}
                                  className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                                >
                                  {payingId === inv.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  Marcar pagada
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Últimos consumos</h3>
                    <div className="space-y-1 text-xs">
                      {detail.recent_events.slice(0, 20).map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between py-1 border-b border-white/[.04] text-gray-400">
                          <span>{EVENT_LABELS[ev.event_type] ?? ev.event_type}{ev.total_tokens ? ` · ${num(ev.total_tokens)} tok` : ""}</span>
                          <span>{num(ev.credits_charged)} cr · <span className="text-amber-300/80">{cop(ev.provider_cost_cop)}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
