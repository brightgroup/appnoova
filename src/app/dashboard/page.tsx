"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MessageCircle, Zap, Phone, Loader2 } from "lucide-react";

import { inputSearch } from "@/lib/brand-ui";
import { authFetch } from "@/lib/telephony-api";

interface DashboardStats {
  profile: { name: string; email: string; initials: string };
  organization: { id: string; name: string };
  stats: {
    active_leads: { value: number; change: string | null };
    conversations: { value: number; change: string | null };
    quotes_today: { value: number; change: string | null };
    conversion_rate: { value: number; change: string | null };
  };
  recent_leads: {
    id: string;
    name: string;
    subtitle: string;
    status: string;
    dateLabel: string;
  }[];
  activity_24h: {
    conversations_processed: number;
    quotes_generated: number;
    leads_classified: number;
    voice_calls_completed: number;
  };
}

const fmtN = (n: number) => new Intl.NumberFormat("es-CO").format(n);

function changeClass(change: string | null, color: string): string {
  if (!change) return "text-gray-500";
  if (change.startsWith("-")) return "text-red-400";
  return color;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/dashboard/stats");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const profile = data?.profile ?? { name: "—", email: "", initials: "?" };
  const stats = data?.stats;
  const activity = data?.activity_24h;
  const recentLeads = data?.recent_leads ?? [];

  const statCards = stats
    ? [
        {
          label: "Leads Activos",
          value: fmtN(stats.active_leads.value),
          change: stats.active_leads.change,
          color: "primary" as const,
        },
        {
          label: "Conversaciones",
          value: fmtN(stats.conversations.value),
          change: stats.conversations.change,
          color: "blue" as const,
        },
        {
          label: "Cotizaciones Hoy",
          value: fmtN(stats.quotes_today.value),
          change: stats.quotes_today.change,
          color: "cyan" as const,
        },
        {
          label: "Tasa Conversión",
          value: `${stats.conversion_rate.value}%`,
          change: stats.conversion_rate.change,
          color: "green" as const,
        },
      ]
    : [];

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[.06] bg-noova-main/50 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar leads, agentes..."
              className={`${inputSearch} max-w-md pl-4`}
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/[.08] rounded-lg transition-colors relative">
              <Bell className="w-5 h-5 text-gray-400" />
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-white/[.06]">
              <div>
                <p className="text-sm font-medium text-white">{profile.name}</p>
                <p className="text-xs text-gray-500">{profile.email || data?.organization.name}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#5b5bf6] to-[#7070f8] flex items-center justify-center">
                <span className="text-sm font-bold">{profile.initials}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">
              Bienvenido{data?.organization.name ? ` a ${data.organization.name}` : " a Noova 360"}
            </h1>
            <p className="text-gray-400">Panel de control — IA operativa para tu negocio</p>
          </div>

          {loading && !data ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Cargando métricas…
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {statCards.map((stat, i) => (
                  <div
                    key={i}
                    className="bg-white/[.02] border border-white/[.08] rounded-xl p-6 hover:bg-white/[.04] transition-colors"
                  >
                    <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold">{stat.value}</span>
                      {stat.change && (
                        <span
                          className={`text-sm font-medium ${changeClass(
                            stat.change,
                            stat.color === "primary"
                              ? "text-[#5b5bf6]"
                              : stat.color === "blue"
                                ? "text-blue-400"
                                : stat.color === "cyan"
                                  ? "text-cyan-400"
                                  : "text-green-400"
                          )}`}
                        >
                          {stat.change}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Main Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">Leads Recientes</h2>
                      <Link href="/dashboard/crm/leads" className="text-xs text-[#a5a5ff] hover:underline">
                        Ver todos
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {recentLeads.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4">Aún no hay leads registrados.</p>
                      ) : (
                        recentLeads.map((lead) => (
                          <Link
                            key={lead.id}
                            href={`/dashboard/crm/leads/${lead.id}`}
                            className="flex items-center justify-between p-3 bg-white/[.02] rounded-lg hover:bg-white/[.04] transition-colors"
                          >
                            <div>
                              <p className="font-medium text-white">{lead.name}</p>
                              <p className="text-xs text-gray-500">{lead.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs px-2 py-1 rounded-full bg-[#5b5bf6]/20 text-[#a5a5ff]">
                                {lead.status}
                              </span>
                              <span className="text-xs text-gray-500">{lead.dateLabel}</span>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                    <h2 className="text-lg font-bold mb-4">Actividad IA — Últimas 24h</h2>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-400">
                        ✓ <span className="text-white">{fmtN(activity?.conversations_processed ?? 0)}</span>{" "}
                        conversaciones procesadas
                      </p>
                      <p className="text-gray-400">
                        ✓ <span className="text-white">{fmtN(activity?.quotes_generated ?? 0)}</span> cotizaciones
                        generadas
                      </p>
                      <p className="text-gray-400">
                        ✓ <span className="text-white">{fmtN(activity?.leads_classified ?? 0)}</span> leads
                        clasificados
                      </p>
                      <p className="text-gray-400">
                        ✓ <span className="text-white">{fmtN(activity?.voice_calls_completed ?? 0)}</span> llamadas
                        de recordatorio completadas
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-[#5b5bf6]/20 to-[#7070f8]/10 border border-[#5b5bf6]/20 rounded-xl p-6">
                    <p className="text-sm font-semibold text-[#a5a5ff] mb-3">💡 Pro Tip</p>
                    <p className="text-sm text-gray-300 mb-4">
                      Activa ORI Copiloto para recibir sugerencias automáticas en tus cotizaciones.
                    </p>
                    <Link
                      href="/dashboard/ori"
                      className="block w-full text-center px-4 py-2 rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-medium transition-colors"
                    >
                      Activar ORI
                    </Link>
                  </div>

                  <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                    <h2 className="text-lg font-bold mb-4">Acciones Rápidas</h2>
                    <div className="space-y-2">
                      <Link
                        href="/dashboard/crm/leads/nuevo"
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Nuevo Lead
                      </Link>
                      <Link
                        href="/dashboard/ori"
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors"
                      >
                        <Zap className="w-4 h-4" />
                        Generar Cotización
                      </Link>
                      <Link
                        href="/dashboard/agentes-voz"
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Llamada IA
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
