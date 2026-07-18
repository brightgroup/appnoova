"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import { BackIcon, CalendarIcon, CreditsIcon } from "../../../icons";
import { formatCOP, formatUSD, formatShortDate } from "../../../format";

interface Invoice {
  id: string;
  plan_id: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_cop: number;
  status: "pending" | "paid" | "overdue" | "void";
}

interface BillingMe {
  subscription: {
    price_usd: number;
    current_period_end: string;
    monthly_credits: number;
    plans?: { name: string; price_usd: number; monthly_credits: number; whatsapp_included: boolean } | null;
  } | null;
  wallet: {
    period_end: string;
    included_credits: number;
    used_credits: number;
    total_credits: number;
    remaining_credits: number;
    used_pct: number;
  } | null;
  invoices: Invoice[];
}

const PLAN_LABELS: Record<string, string> = {
  explorador: "Explorador",
  esencial: "Esencial",
  crecimiento: "Crecimiento",
  escala: "Escala"
};

const STATUS_LABEL: Record<Invoice["status"], string> = {
  paid: "Pagada",
  pending: "Pendiente",
  overdue: "Vencida",
  void: "Anulada"
};

function invoiceMonthLabel(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function MobileFacturacionPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/billing/me")
      .then(async (res) => {
        if (res.status === 403) {
          if (!cancelled) setError("No tienes acceso al módulo de Facturación.");
          return;
        }
        if (!res.ok) throw new Error("request failed");
        const json = await res.json();
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la información de facturación.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscription = data?.subscription ?? null;
  const wallet = data?.wallet ?? null;
  const invoices = data?.invoices ?? [];
  const planName = subscription?.plans?.name ?? "";
  const monthlyCredits = subscription?.monthly_credits ?? subscription?.plans?.monthly_credits ?? 0;
  const priceUsd = subscription?.price_usd ?? subscription?.plans?.price_usd ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="app-head">
        <div className="back-row">
          <button className="back-btn" aria-label="Volver a cuenta" onClick={() => router.push("/m/cuenta")}>
            <BackIcon />
          </button>
          <div>
            <p className="kicker">Suscripción</p>
            <h1>Facturación</h1>
          </div>
        </div>
      </div>

      <div className="nv-m-scroll">
        <div className="bill-body">
          {error ? (
            <div className="empty-state">{error}</div>
          ) : !data ? null : (
            <>
              {subscription ? (
                <div className="card card-plan">
                  <div className="plan-top">
                    <span className="card-label">Plan actual</span>
                    {planName ? <span className="plan-pill">{planName}</span> : null}
                  </div>
                  <div className="plan-price">
                    {formatUSD(priceUsd)} <span className="per">/ mes</span>
                  </div>
                  <div className="usage-foot">
                    {monthlyCredits ? `${formatCOP(monthlyCredits)} en créditos incluidos` : ""}
                    {subscription.plans?.whatsapp_included ? " · WhatsApp incluido" : ""}
                  </div>
                </div>
              ) : null}

              {wallet ? (
                <div className="card">
                  <div className="usage-grid">
                    <div className="usage-blk">
                      <span className="card-label">
                        <CreditsIcon />
                        Créditos usados
                      </span>
                      <div className="usage-num">
                        {formatCOP(wallet.used_credits)} <span className="sub">/ {formatCOP(wallet.total_credits)}</span>
                      </div>
                      <div className="meter">
                        <i style={{ width: `${Math.min(100, Math.round(wallet.used_pct))}%` }} />
                      </div>
                      <div className="usage-foot">
                        {Math.round(wallet.used_pct)}% del ciclo · renueva el {formatShortDate(wallet.period_end)}
                      </div>
                    </div>
                    <div className="usage-blk card-split">
                      <span className="card-label">
                        <CreditsIcon />
                        Créditos restantes
                      </span>
                      <div className="usage-num">{formatCOP(wallet.remaining_credits)}</div>
                      <div className="usage-foot">de {formatCOP(wallet.included_credits)} incluidos</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {subscription ? (
                <div className="card">
                  <div className="plan-top">
                    <span className="card-label">
                      <CalendarIcon />
                      Próximo cobro
                    </span>
                    <span className="inv-amount">{formatUSD(priceUsd)}</span>
                  </div>
                  <div className="usage-foot" style={{ marginTop: 10 }}>
                    {formatShortDate(subscription.current_period_end)}
                  </div>
                </div>
              ) : null}

              {invoices.length > 0 ? (
                <>
                  <p className="section-label">Facturas</p>
                  {invoices.map((inv) => (
                    <div className="inv-card" key={inv.id}>
                      <div className="inv-row1">
                        <div>
                          <div className="inv-id">FAC-{inv.id.slice(0, 8).toUpperCase()}</div>
                          <div className="inv-desc">
                            {PLAN_LABELS[inv.plan_id ?? ""] ?? inv.plan_id ?? "Plan"} · {invoiceMonthLabel(inv.period_start)}
                          </div>
                        </div>
                        <span className={`status ${inv.status}`}>
                          <span className="dot" />
                          {STATUS_LABEL[inv.status]}
                        </span>
                      </div>
                      <div className="inv-row2">
                        <div className="inv-meta">
                          <span className="inv-date">{formatShortDate(inv.due_date)}</span>
                          <span className="inv-amount">{formatCOP(inv.amount_cop)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-state">Todavía no hay facturas para esta organización.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
