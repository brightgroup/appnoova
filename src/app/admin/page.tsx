"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, BarChart3, Phone, Settings, MessageCircle, Building2, Shield,
  Bot, Loader2, Clock, AlertCircle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/telephony-api";

interface AdminStats {
  users_total: number;
  users_active: number;
  organizations_total: number;
  organizations_active: number;
  pending_telephony_requests: number;
  phone_lines_total: number;
  whatsapp_channels_total: number;
  pending_whatsapp_templates: number;
  voice_agents_total: number;
  text_agents_total: number;
  calls_today: number;
  avg_call_duration_label: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const pendingTotal =
    (stats?.pending_telephony_requests ?? 0) + (stats?.pending_whatsapp_templates ?? 0);

  const statCards = stats
    ? [
        {
          label: "Usuarios",
          value: String(stats.users_total),
          hint: `${stats.users_active} activos`,
          icon: Users,
          color: "primary" as const,
          href: "/admin/users",
        },
        {
          label: "Organizaciones",
          value: String(stats.organizations_total),
          hint: `${stats.organizations_active} activas`,
          icon: Building2,
          color: "blue" as const,
          href: "/admin/organizations",
        },
        {
          label: "Agentes IA",
          value: String(stats.voice_agents_total + stats.text_agents_total),
          hint: `${stats.voice_agents_total} voz · ${stats.text_agents_total} texto`,
          icon: Bot,
          color: "cyan" as const,
          href: "/admin/templates",
        },
        {
          label: "Llamadas hoy",
          value: String(stats.calls_today),
          hint: stats.calls_today > 0 ? `Prom. ${stats.avg_call_duration_label}` : "Sin llamadas hoy",
          icon: Phone,
          color: "green" as const,
          href: "/admin/calls",
        },
        {
          label: "Líneas telefónicas",
          value: String(stats.phone_lines_total),
          hint: stats.pending_telephony_requests > 0
            ? `${stats.pending_telephony_requests} solicitud${stats.pending_telephony_requests !== 1 ? "es" : ""} pendiente${stats.pending_telephony_requests !== 1 ? "s" : ""}`
            : "Operativas en plataforma",
          icon: Phone,
          color: "blue" as const,
          href: "/admin/telephony",
        },
        {
          label: "WhatsApp",
          value: String(stats.whatsapp_channels_total),
          hint: stats.pending_whatsapp_templates > 0
            ? `${stats.pending_whatsapp_templates} plantilla${stats.pending_whatsapp_templates !== 1 ? "s" : ""} en revisión`
            : "Líneas registradas",
          icon: MessageCircle,
          color: "cyan" as const,
          href: "/admin/whatsapp",
        },
      ]
    : [];

  const menuItems = [
    {
      href: "/admin/users",
      label: "Usuarios",
      description: "Activar, desactivar y permisos de plataforma",
      icon: Users,
      badge: stats?.users_total,
    },
    {
      href: "/admin/organizations",
      label: "Organizaciones",
      description: "Cuentas tenant y estado de la suscripción",
      icon: Building2,
      badge: stats?.organizations_total,
    },
    {
      href: "/admin/roles",
      label: "Roles y permisos",
      description: "Matriz de acceso por módulo",
      icon: Shield,
    },
    {
      href: "/admin/telephony",
      label: "Líneas telefónicas",
      description: "Comprar y asignar números Telnyx",
      icon: Phone,
      badge: stats?.pending_telephony_requests,
      alert: (stats?.pending_telephony_requests ?? 0) > 0,
    },
    {
      href: "/admin/whatsapp",
      label: "WhatsApp (Twilio)",
      description: "Líneas, webhooks y aprobaciones Meta",
      icon: MessageCircle,
      badge: stats?.pending_whatsapp_templates,
      alert: (stats?.pending_whatsapp_templates ?? 0) > 0,
    },
    {
      href: "/admin/templates",
      label: "Configurar Agentes",
      description: "Editar prompts y configuraciones",
      icon: Settings,
    },
    {
      href: "/admin/calls",
      label: "Historial de Llamadas",
      description: "Transcripciones y análisis",
      icon: BarChart3,
      badge: stats?.calls_today,
    },
  ];

  return (
    <div className="flex-1 flex flex-col text-white">
      <div className="border-b border-white/[.08] px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Panel Administrador</h1>
            {user?.email && <p className="text-sm text-gray-500">Sesión: {user.email}</p>}
          </div>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.06] transition-colors disabled:opacity-50"
            title="Actualizar métricas"
          >
            <Loader2 className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {pendingTotal > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/25 bg-amber-500/[.06] text-sm text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {pendingTotal} pendiente{pendingTotal !== 1 ? "s" : ""} requiere{pendingTotal === 1 ? "" : "n"} atención
              {(stats?.pending_telephony_requests ?? 0) > 0 && (
                <> · <Link href="/admin/telephony?tab=solicitudes" className="text-[#a5a5ff] hover:underline">{stats?.pending_telephony_requests} solicitud{stats?.pending_telephony_requests !== 1 ? "es" : ""} de línea</Link></>
              )}
              {(stats?.pending_whatsapp_templates ?? 0) > 0 && (
                <> · <Link href="/admin/whatsapp?tab=aprobaciones" className="text-[#a5a5ff] hover:underline">{stats?.pending_whatsapp_templates} plantilla{stats?.pending_whatsapp_templates !== 1 ? "s" : ""} WA</Link></>
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {loading && !stats ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/[.02] border border-white/[.08] rounded-xl p-6 animate-pulse">
                <div className="h-4 w-24 bg-white/[.06] rounded mb-4" />
                <div className="h-8 w-16 bg-white/[.08] rounded" />
              </div>
            ))
          ) : (
            statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="bg-white/[.02] border border-white/[.08] rounded-xl p-6 hover:border-[#5b5bf6]/40 hover:bg-white/[.04] transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-400 text-sm">{stat.label}</p>
                    <Icon className={`w-5 h-5 ${
                      stat.color === "primary" ? "text-[#5b5bf6]" :
                      stat.color === "blue" ? "text-blue-400" :
                      stat.color === "cyan" ? "text-cyan-400" :
                      "text-green-400"
                    }`} />
                  </div>
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    {stat.label === "Llamadas hoy" && stats && stats.calls_today > 0 && (
                      <Clock className="w-3 h-3" />
                    )}
                    {stat.hint}
                  </p>
                </Link>
              );
            })
          )}
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Opciones</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative overflow-hidden rounded-xl bg-white/[.02] border border-white/[.08] p-6 hover:border-[#5b5bf6]/50 hover:bg-white/[.04] transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#5b5bf6]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <Icon className="w-8 h-8 text-[#5b5bf6]" />
                      {item.alert && item.badge ? (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                          {item.badge}
                        </span>
                      ) : item.badge !== undefined && item.badge > 0 ? (
                        <span className="text-xs font-semibold text-gray-400 tabular-nums">{item.badge}</span>
                      ) : null}
                    </div>
                    <h3 className="font-semibold mb-1">{item.label}</h3>
                    <p className="text-sm text-gray-400">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
