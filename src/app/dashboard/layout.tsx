"use client";

import { useState, useEffect } from "react";
import { LogOut, Settings, ChevronLeft, ChevronRight, BarChart3, Radio, MessageSquare, Target, Bot, CreditCard, Building2, Loader2, Share2, Contact, Users, Database } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { NoovaLogo } from "@/components/brand/NoovaLogo";
import { authFetch } from "@/lib/telephony-api";
import {
  sidebarNavActive, sidebarNavIdle, sidebarIconActive, sidebarBadge, sidebarPlanCard
} from "@/lib/brand-ui";
import { CANALES_NAV } from "@/lib/canales-nav";
import { AGENTES_VOZ_NAV } from "@/lib/agentes-voz-nav";
import { AGENTES_TEXTO_NAV } from "@/lib/agentes-texto-nav";
import { CRM_NAV } from "@/lib/crm-nav";
import type { LucideIcon } from "lucide-react";

function formatCreditsShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("es-CO").format(Math.round(n));
}

function SidebarSubMenu({
  items,
  pathname
}: {
  items: { name: string; href: string; icon?: LucideIcon }[];
  pathname: string;
}) {
  return (
    <div className="ml-4 mt-1 space-y-0.5 pb-2">
      {items.map((item, i) => {
        const active =
          item.href !== "#" &&
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={i}
            href={item.href}
            className={`group flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
              active
                ? "text-[#a5a5ff] bg-[#5b5bf6]/10"
                : "text-gray-300 hover:text-white hover:bg-white/[.06]"
            }`}
          >
            {Icon ? (
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#a5a5ff]" : "text-gray-500 group-hover:text-gray-300"}`} />
            ) : (
              <span
                aria-hidden
                className={`shrink-0 rounded-[3px] transition-all duration-200 ${
                  active
                    ? "h-2 w-2 bg-[#5b5bf6] shadow-[0_0_8px_rgba(91,91,246,0.4)]"
                    : "h-1.5 w-1.5 bg-white/20 group-hover:bg-white/35"
                }`}
              />
            )}
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [billing, setBilling] = useState<{
    planName: string;
    remaining: number;
    total: number;
    usedPct: number;
    status: string;
    promoLabel?: string | null;
    promoPriceUsd?: number | null;
    promoPriceCatalogUsd?: number | null;
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!checked) return;
    let cancelled = false;
    authFetch("/api/billing/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const w = json.wallet;
        const planName = json.subscription?.plans?.name ?? json.subscription?.plan_id ?? "Plan";
        if (w) {
          setBilling({
            planName,
            remaining: Number(w.remaining_credits ?? 0),
            total:     Number(w.total_credits ?? 0),
            usedPct:   Number(w.used_pct ?? 0),
            status:    json.subscription?.status ?? "active",
            promoLabel: json.plan_promo?.label ?? json.plan_promo?.headline ?? null,
            promoPriceUsd: json.plan_promo?.price_usd ?? null,
            promoPriceCatalogUsd: json.plan_promo?.price_usd_catalog ?? null,
          });
        }
      })
      .catch(() => { /* silencioso */ });
    return () => { cancelled = true; };
  }, [checked, pathname]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/agentes-voz")) {
      setExpandedMenu("voz");
    } else if (
      pathname.startsWith("/dashboard/agentes-texto") ||
      pathname.startsWith("/dashboard/inbox")
    ) {
      setExpandedMenu("texto");
    } else if (
      pathname.startsWith("/dashboard/canales") ||
      pathname.startsWith("/dashboard/micrositio")
    ) {
      setExpandedMenu("canales");
    } else if (pathname.startsWith("/dashboard/crm")) {
      setExpandedMenu("crm");
    }
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setAuthReady(true);
      router.replace("/login");
    }, 12_000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        clearTimeout(timeout);
        setAuthReady(true);
        if (!session) {
          router.replace("/login");
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timeout);
        setAuthReady(true);
        router.replace("/login");
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const showShell = authReady && checked;

  const toggleMenu = (menu: string) => {
    setExpandedMenu(expandedMenu === menu ? null : menu);
  };

  return (
    <div className="flex h-screen bg-noova-main text-white" data-noova-dashboard>
      {showShell && (
      <div
        className={`${sidebarOpen ? "w-64" : "w-20"} bg-noova-surface border-r border-white/[.10] transition-all duration-300 flex flex-col overflow-hidden`}
        data-noova-sidebar
      >
        {/* Logo */}
        <div className={`p-4 border-b border-white/[.08] flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
          {sidebarOpen && (
            <Link href="/dashboard" className="flex-shrink-0">
              <NoovaLogo width={176} height={40} priority />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-white/[.12] rounded-lg transition-colors text-gray-300 hover:text-white"
            title={sidebarOpen ? "Comprimir menú" : "Expandir menú"}
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${sidebarOpen ? "p-3 space-y-1" : "p-3 space-y-3"} overflow-y-auto scrollbar-thin`}>
          {/* Agentes de Voz */}
          <div>
            <button
              onClick={() => toggleMenu("voz")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "voz" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Agentes de Voz"
            >
              {sidebarOpen ? (
                <>
                  <Radio className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">Agentes de Voz</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "voz" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Radio className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "voz" && (
              <SidebarSubMenu pathname={pathname} items={AGENTES_VOZ_NAV} />
            )}
          </div>

          {/* Agentes de Texto */}
          <div>
            <button
              onClick={() => toggleMenu("texto")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "texto" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Agentes de Texto"
            >
              {sidebarOpen ? (
                <>
                  <MessageSquare className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">Agentes de Texto</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "texto" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <MessageSquare className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "texto" && (
              <SidebarSubMenu pathname={pathname} items={AGENTES_TEXTO_NAV} />
            )}
          </div>

          {/* Canales */}
          <div>
            <button
              onClick={() => toggleMenu("canales")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "canales" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Canales"
            >
              {sidebarOpen ? (
                <>
                  <Share2 className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">Canales</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "canales" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Share2 className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "canales" && (
              <SidebarSubMenu pathname={pathname} items={CANALES_NAV} />
            )}
          </div>

          {/* CRM */}
          <div>
            <button
              onClick={() => toggleMenu("crm")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "crm" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="CRM"
            >
              {sidebarOpen ? (
                <>
                  <Contact className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">CRM</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "crm" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Contact className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "crm" && (
              <SidebarSubMenu pathname={pathname} items={CRM_NAV} />
            )}
          </div>

          {/* Campañas */}
          <button 
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all ${
              sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
            }`}
            title="Campañas"
          >
            {sidebarOpen ? (
              <>
                <Target className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Campañas</span>
              </>
            ) : (
              <Target className="w-5 h-5 flex-shrink-0" />
            )}
          </button>

          {/* ORI (Copiloto) */}
          <Link
            href="/dashboard/ori"
            className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/dashboard/ori"
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="ORI - Copiloto"
          >
            {sidebarOpen ? (
              <>
                <Bot className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname === "/dashboard/ori" ? sidebarIconActive : "text-gray-400"}`} />
                <div className="flex-1 flex items-center gap-2">
                  <span>ORI</span>
                  <span className={sidebarBadge}>Copiloto</span>
                </div>
              </>
            ) : (
              <Bot className={`w-5 h-5 flex-shrink-0 ${pathname === "/dashboard/ori" ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2"></div>}

          {/* Dashboard */}
          <Link 
            href="/dashboard"
            className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/dashboard" ? sidebarNavActive : sidebarNavIdle
            }`}
            title="Dashboard"
          >
            {sidebarOpen ? (
              <>
                <BarChart3 className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname === "/dashboard" ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Dashboard</span>
              </>
            ) : (
              <BarChart3 className={`w-5 h-5 flex-shrink-0 ${pathname === "/dashboard" ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2"></div>}

          {/* Contextos de marca */}
          <Link
            href="/dashboard/contextos"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/contextos"
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="Contextos de marca"
          >
            {sidebarOpen ? (
              <>
                <Building2 className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname === "/dashboard/contextos" ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Contextos</span>
              </>
            ) : (
              <Building2 className={`w-5 h-5 flex-shrink-0 ${pathname === "/dashboard/contextos" ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {/* Tablas de datos */}
          <Link
            href="/dashboard/tablas"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/tablas" || pathname.startsWith("/dashboard/tablas/")
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="Tablas de datos"
          >
            {sidebarOpen ? (
              <>
                <Database className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname.startsWith("/dashboard/tablas") ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Tablas</span>
              </>
            ) : (
              <Database className={`w-5 h-5 flex-shrink-0 ${pathname.startsWith("/dashboard/tablas") ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {/* Equipo */}
          <Link
            href="/dashboard/equipo"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/equipo" || pathname.startsWith("/dashboard/equipo/")
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="Equipo"
          >
            {sidebarOpen ? (
              <>
                <Users className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname.startsWith("/dashboard/equipo") ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Equipo</span>
              </>
            ) : (
              <Users className={`w-5 h-5 flex-shrink-0 ${pathname.startsWith("/dashboard/equipo") ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {/* Facturación */}
          <Link
            href="/dashboard/facturacion"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/facturacion" || pathname.startsWith("/dashboard/facturacion/")
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="Facturación"
          >
            {sidebarOpen ? (
              <>
                <CreditCard className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname.startsWith("/dashboard/facturacion") ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Facturación</span>
              </>
            ) : (
              <CreditCard className={`w-5 h-5 flex-shrink-0 ${pathname.startsWith("/dashboard/facturacion") ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>

          {/* Configuración */}
          <Link
            href="/dashboard/configuracion"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/configuracion" || pathname.startsWith("/dashboard/configuracion/")
                ? sidebarNavActive
                : sidebarNavIdle
            }`}
            title="Configuración"
          >
            {sidebarOpen ? (
              <>
                <Settings className={`w-5 h-5 flex-shrink-0 mr-3 ${pathname.startsWith("/dashboard/configuracion") ? sidebarIconActive : "text-gray-400"}`} />
                <span className="flex-1 text-left">Configuración</span>
              </>
            ) : (
              <Settings className={`w-5 h-5 flex-shrink-0 ${pathname.startsWith("/dashboard/configuracion") ? sidebarIconActive : "text-gray-400"}`} />
            )}
          </Link>
        </nav>

        {/* Footer - Plan & Logout */}
        <div className={`${sidebarOpen ? "p-3 space-y-3" : "p-3 space-y-3"} border-t border-white/[.08]`}>
          {/* Plan Card */}
          {sidebarOpen && (() => {
            const pct   = billing?.usedPct ?? 0;
            const st    = billing?.status ?? "active";
            const badge =
              st === "active"    ? "bg-green-500/20 text-green-400"  :
              st === "trialing"  ? "bg-blue-500/20 text-blue-400"    :
              st === "past_due"  ? "bg-amber-500/20 text-amber-400"  :
              "bg-gray-500/20 text-gray-400";
            const badgeLabel =
              st === "active"    ? "Activo"     :
              st === "trialing"  ? "En prueba"  :
              st === "past_due"  ? "Vencida"    :
              st === "suspended" ? "Suspendida" : "Inactivo";
            return (
              <Link
                href="/dashboard/facturacion"
                className={`block ${sidebarPlanCard}`}
              >
                {/* Fila 1: etiqueta + badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest">Plan actual</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge}`}>
                    {badgeLabel}
                  </span>
                </div>

                {/* Fila 2: nombre del plan */}
                <p className="text-lg font-bold text-white leading-snug mb-1 capitalize">
                  {billing?.planName ?? "—"}
                </p>
                {billing?.promoLabel && (
                  <p className="text-[10px] text-[#a5a5ff] font-medium mb-1 truncate" title={billing.promoLabel}>
                    {billing.promoLabel}
                  </p>
                )}
                {billing?.promoPriceUsd != null &&
                  billing.promoPriceCatalogUsd != null &&
                  billing.promoPriceUsd < billing.promoPriceCatalogUsd && (
                  <p className="text-[10px] text-green-400 mb-2">
                    <span className="line-through text-gray-500 mr-1">${billing.promoPriceCatalogUsd}</span>
                    ${billing.promoPriceUsd}/mes
                  </p>
                )}

                {/* Fila 3: créditos + barra */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {billing ? formatCreditsShort(billing.remaining) : "—"}
                      <span className="text-gray-600"> / {billing ? formatCreditsShort(billing.total) : "—"} créditos</span>
                    </span>
                    <span className="text-xs font-semibold text-gray-400">{pct}%</span>
                  </div>
                  <div className="h-[3px] rounded-full bg-[var(--nv-border)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[#5b5bf6]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })()}

          {/* Logout */}
          <button
            onClick={logout}
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all ${
              sidebarOpen ? "hover:text-red-400 hover:bg-red-500/10" : "hover:text-red-400"
            }`}
            title="Cerrar sesión"
          >
            {sidebarOpen ? (
              <>
                <LogOut className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Cerrar sesión</span>
              </>
            ) : (
              <LogOut className="w-5 h-5 flex-shrink-0" />
            )}
          </button>
        </div>
      </div>
      )}

      {/* Content — siempre montado para evitar error de hidratación */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {(!authReady || !checked) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-noova-main text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando...
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
