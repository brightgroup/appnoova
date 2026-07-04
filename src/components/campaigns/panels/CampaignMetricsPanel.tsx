"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Coins, Loader2, Phone, Timer, Users } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import type { CampaignAudienceStats } from "@/types/voice-campaign";

interface CampaignMetricsPanelProps {
  campaignId: string;
}

const EMPTY: CampaignAudienceStats = {
  total_contacts: 0,
  called: 0,
  completed: 0,
  failed: 0,
  pending: 0,
  connection_rate: 0,
  success_rate: 0,
};

export function CampaignMetricsPanel({ campaignId }: CampaignMetricsPanelProps) {
  const [stats, setStats] = useState<CampaignAudienceStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [dateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/campaigns/${campaignId}/audience-rows`);
    const json = await res.json();
    setLoading(false);
    if (res.ok) setStats(json.stats ?? EMPTY);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: "Créditos usados", value: "0", icon: Coins },
    { label: "Total de llamadas", value: String(stats.called), icon: Phone },
    { label: "Contactos llamados", value: String(stats.called), icon: Users },
    { label: "Tasa de conexión", value: `${stats.connection_rate}%`, icon: Phone },
    { label: "Duración promedio", value: "00m 00s", icon: Timer },
  ];

  const funnel = [
    { label: "Total de contactos", pct: 100, color: "bg-[#5b5bf6]" },
    {
      label: "Conectado",
      pct: stats.connection_rate,
      color: "bg-amber-400",
    },
    {
      label: "Exitosas",
      pct: stats.success_rate,
      color: "bg-emerald-400",
    },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando métricas…
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[.10] bg-white/[.03] text-xs text-gray-300">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          {formatRange(dateFrom, dateTo)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"
            >
              <div className="w-8 h-8 rounded-lg bg-[#5b5bf6]/15 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-[#a5a5ff]" />
              </div>
              <p className="text-[11px] text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5 min-h-[280px]">
          <h3 className="text-sm font-semibold text-white mb-4">Llamadas realizadas</h3>
          {stats.called === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-500 text-center px-4">
              No hay datos disponibles para el rango de fechas seleccionado
            </div>
          ) : (
            <div className="space-y-2 text-sm text-gray-400">
              <p>Completadas: {stats.completed}</p>
              <p>Fallidas: {stats.failed}</p>
              <p>Pendientes: {stats.pending}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5 min-h-[280px]">
          <h3 className="text-sm font-semibold text-white mb-4">Embudo de contacto</h3>
          <div className="space-y-4">
            {funnel.map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="flex items-center gap-2 text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <span className="text-gray-500 tabular-nums">{item.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/[.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all`}
                    style={{ width: `${Math.min(100, item.pct)}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-gray-600 pt-2">
              {stats.total_contacts} contactos en audiencia
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${f.toLocaleDateString("es-CO", opts)} – ${t.toLocaleDateString("es-CO", opts)}`;
}
