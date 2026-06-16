"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard, RefreshCw, AlertTriangle, CheckCircle2, Calendar,
  Zap, TrendingUp, Receipt
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, textMuted } from "@/lib/brand-ui";

interface Wallet {
  period_start: string;
  period_end: string;
  included_credits: number;
  topup_credits: number;
  used_credits: number;
  total_credits: number;
  remaining_credits: number;
  used_pct: number;
}

interface Subscription {
  plan_id: string;
  status: string;
  price_usd: number;
  monthly_credits: number;
  current_period_end: string;
  trial_ends_at: string | null;
  plans?: { name: string; price_usd: number; monthly_credits: number; whatsapp_included: boolean; support_level: string };
}

interface UsageRow {
  event_type: string;
  events: number;
  credits: number;
  cost_cop: number;
}

interface Invoice {
  id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_usd: number;
  amount_cop: number;
  status: string;
}

interface BillingData {
  subscription: Subscription | null;
  wallet: Wallet | null;
  usage: UsageRow[];
  invoices: Invoice[];
}

const EVENT_LABELS: Record<string, string> = {
  ori: "ORI (copiloto)",
  milink: "Mi Link (web)",
  widget: "Widget web",
  text_test: "Prueba de agentes",
  whatsapp_ai: "WhatsApp con IA",
  whatsapp_manual: "WhatsApp manual",
  voice: "Llamadas de voz",
  doc_scan: "Escaneo de documentos",
  form_fill: "Formularios",
  quote: "Cotizaciones"
};

const SUB_STATUS: Record<string, { label: string; color: string }> = {
  trialing: { label: "Prueba", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  active: { label: "Activa", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  past_due: { label: "Pago pendiente", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  suspended: { label: "Suspendida", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  canceled: { label: "Cancelada", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" }
};

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-500/20 text-amber-300" },
  paid: { label: "Pagada", color: "bg-green-500/20 text-green-300" },
  overdue: { label: "Vencida", color: "bg-red-500/20 text-red-300" },
  void: { label: "Anulada", color: "bg-gray-500/20 text-gray-300" }
};

function fmtCredits(n: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(n));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export default function FacturacionPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/billing/me");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar facturación");
    else setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const wallet = data?.wallet;
  const sub = data?.subscription;
  const planName = sub?.plans?.name ?? sub?.plan_id ?? "—";
  const status = sub?.status ?? "active";
  const statusBadge = SUB_STATUS[status] ?? SUB_STATUS.active;
  const remaining = wallet?.remaining_credits ?? 0;
  const daysLeft = daysUntil(wallet?.period_end ?? null);

  const blocked = status === "suspended" || status === "canceled";
  const noCredits = !blocked && remaining <= 0 && (wallet?.total_credits ?? 0) > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-noova-main text-white">
      <div className="px-6 py-5 border-b border-white/[.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#5b5bf6]" />
          <h1 className="text-xl font-bold tracking-tight">Facturación y consumo</h1>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/[.08]" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
        )}

        {blocked && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-200">Cuenta suspendida</p>
              <p className="text-sm text-red-300/90">Tu servicio de IA está pausado. Regulariza el pago de tu factura para reactivar la cuenta.</p>
            </div>
          </div>
        )}

        {noCredits && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Sin créditos este mes</p>
              <p className="text-sm text-amber-300/90">
                Tus créditos se renuevan el {fmtDate(wallet?.period_end ?? null)}. Contacta a tu proveedor para una recarga si necesitas más.
              </p>
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : (
          <>
            {/* Plan + saldo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400">Tu plan</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusBadge.color}`}>{statusBadge.label}</span>
                </div>
                <p className="text-2xl font-bold">{planName}</p>
                <p className={`text-sm ${textMuted} mt-1`}>
                  {sub && sub.price_usd > 0 ? `$${sub.price_usd}/mes` : "Plan de prueba"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-5 md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Créditos disponibles</span>
                  {daysLeft != null && (
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Se renuevan en {daysLeft} día{daysLeft === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold tabular-nums text-[#5b5bf6]">
                  {fmtCredits(remaining)}
                  <span className="text-base font-normal text-gray-500"> / {fmtCredits(wallet?.total_credits ?? 0)}</span>
                </p>
                <div className="mt-3 h-2.5 rounded-full bg-white/[.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(wallet?.used_pct ?? 0) >= 90 ? "bg-red-500" : (wallet?.used_pct ?? 0) >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`}
                    style={{ width: `${wallet?.used_pct ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>Usados: {fmtCredits(wallet?.used_credits ?? 0)}</span>
                  <span>Fecha de facturación: {fmtDate(wallet?.period_end ?? null)}</span>
                </div>
              </div>
            </div>

            {/* Consumo del periodo */}
            <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#5b5bf6]" />
                <h2 className="font-semibold">Consumo de este periodo</h2>
              </div>
              {(data?.usage ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Aún no hay consumo en este periodo.</p>
              ) : (
                <div className="space-y-2">
                  {[...(data?.usage ?? [])].sort((a, b) => b.credits - a.credits).map((u) => (
                    <div key={u.event_type} className="flex items-center justify-between py-2 border-b border-white/[.05] last:border-0">
                      <div>
                        <p className="text-sm font-medium">{EVENT_LABELS[u.event_type] ?? u.event_type}</p>
                        <p className="text-xs text-gray-500">{fmtCredits(u.events)} acciones</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">{fmtCredits(u.credits)} cr</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Facturas */}
            <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-5">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4 text-[#5b5bf6]" />
                <h2 className="font-semibold">Facturas</h2>
              </div>
              {(data?.invoices ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4">No hay facturas todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-white/[.08]">
                        <th className="py-2 pr-4 font-medium">Periodo</th>
                        <th className="py-2 pr-4 font-medium">Vence</th>
                        <th className="py-2 pr-4 font-medium">Monto</th>
                        <th className="py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.invoices ?? []).map((inv) => {
                        const badge = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.pending;
                        return (
                          <tr key={inv.id} className="border-b border-white/[.05] last:border-0">
                            <td className="py-2.5 pr-4">{fmtDate(inv.period_start)}</td>
                            <td className="py-2.5 pr-4 text-gray-300">{fmtDate(inv.due_date)}</td>
                            <td className="py-2.5 pr-4 font-medium">
                              ${inv.amount_usd} <span className="text-xs text-gray-500">(${fmtCredits(inv.amount_cop)} COP)</span>
                            </td>
                            <td className="py-2.5">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                                {inv.status === "paid" && <CheckCircle2 className="w-3 h-3" />}
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-4">
                El pago se coordina con tu proveedor. Si tu factura queda vencida, la cuenta se suspende automáticamente.
              </p>
            </div>
          </>
        )}

        {/* CTA prueba */}
        {sub?.status === "trialing" && sub.trial_ends_at && (
          <div className="rounded-2xl border border-[#5b5bf6]/30 bg-[#5b5bf6]/10 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Estás en periodo de prueba</p>
              <p className={`text-sm ${textMuted}`}>Tu prueba termina el {fmtDate(sub.trial_ends_at)}.</p>
            </div>
            <a href="mailto:info@bgsoluciones.com.co" className={btnPrimary}>Activar plan</a>
          </div>
        )}
      </div>
    </div>
  );
}
