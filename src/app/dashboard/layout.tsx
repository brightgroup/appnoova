"use client";

import { useState, useEffect } from "react";
import { LogOut, ChevronLeft, ChevronRight, BarChart3, Radio, MessageSquare, Target, Bot, Building2, Loader2, Share2, Contact, Database } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { NoovaLogo } from "@/components/brand/NoovaLogo";
import { authFetch } from "@/lib/telephony-api";
import {
  sidebarNavActive, sidebarNavIdle, sidebarPlanCard
} from "@/lib/brand-ui";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { CANALES_NAV } from "@/lib/canales-nav";
import { AGENTES_VOZ_NAV } from "@/lib/agentes-voz-nav";
import { AGENTES_TEXTO_NAV } from "@/lib/agentes-texto-nav";
import { CRM_NAV } from "@/lib/crm-nav";
import { CAMPAIGNS_NAV } from "@/lib/campaigns-nav";
import { sidebarIconBase, sidebarNeonIcon } from "@/lib/sidebar-neon";
import { DesktopOnlyGate } from "@/components/layout/DesktopOnlyGate";
import { SidebarAccountMenu } from "@/components/layout/SidebarAccountMenu";
import { OrgPermissionsProvider, useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";
import { DashboardRouteGuard } from "@/components/layout/DashboardRouteGuard";
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
            className={`group nv-sidebar-sub-link flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
              active
                ? "nv-sidebar-sub-active text-white bg-white/[.14]"
                : "text-white/75 hover:text-white hover:bg-white/[.10]"
            }`}
          >
            {Icon ? (
              <Icon className={`w-4 h-4 shrink-0 nv-sidebar-sub-icon ${active ? "opacity-100" : ""}`} />
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
            <span className="truncate nv-sidebar-sub-label">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgPermissionsProvider enabled>
      <DashboardLayoutShell>{children}</DashboardLayoutShell>
    </OrgPermissionsProvider>
  );
}

function DashboardLayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
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
  const { flags: permFlags, branding } = useOrgPermissions();

  const textoNavItems = AGENTES_TEXTO_NAV.filter((item) =>
    item.href.includes("/inbox") ? permFlags.can_view_inbox : permFlags.can_view_text_agents
  );
  const showTextoSection = textoNavItems.length > 0;
  const showVozSection = permFlags.can_view_voice_agents;
  const showCanalesSection = permFlags.can_view_channels;
  const showCrmSection = permFlags.can_view_crm;
  const showCampaignsSection = permFlags.can_view_campaigns;
  const showContextsSection = permFlags.can_view_contexts;
  const showTablesSection = permFlags.can_view_campaigns;

  useEffect(() => {
    if (!checked) return;
    if (!permFlags.can_view_billing) {
      setBilling(null);
      return;
    }
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
  }, [checked, pathname, permFlags.can_view_billing]);

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
          const meta = session.user.user_metadata ?? {};
          const dn =
            (meta.nombre as string | undefined) ||
            (meta.full_name as string | undefined) ||
            session.user.email?.split("@")[0] ||
            "Usuario";
          setProfileName(dn);
          setProfileEmail(session.user.email ?? "");
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
    <DesktopOnlyGate>
    <div className="flex h-screen bg-noova-main text-white" data-noova-dashboard>
      {showShell && (
      <div
        className={`${sidebarOpen ? "w-64" : "w-20"} border-r border-white/[.10] transition-all duration-300 flex flex-col overflow-hidden`}
        data-noova-sidebar
      >
        {/* Logo */}
        <div className={`p-4 border-b border-white/[.08] flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
          {sidebarOpen && (
            branding.hide_noova_logo ? (
              <Link href="/dashboard" className="flex-shrink-0">
                <span className="text-lg font-semibold text-white tracking-tight">Dashboard</span>
              </Link>
            ) : (
              <Link href="/dashboard" className="flex-shrink-0">
                <NoovaLogo width={176} height={40} priority variant="sidebar" />
              </Link>
            )
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
          {/* Dashboard — primero */}
          <Link
            href="/dashboard"
            className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/dashboard" ? sidebarNavActive : sidebarNavIdle
            }`}
            title="Dashboard"
          >
            {sidebarOpen ? (
              <>
                <BarChart3 className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.dashboard}`} />
                <span className="flex-1 text-left">Dashboard</span>
              </>
            ) : (
              <BarChart3 className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.dashboard}`} />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2" />}

          {/* Agentes de Voz */}
          {showVozSection && (
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
                  <Radio className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.voice}`} />
                  <span className="flex-1 text-left">Agentes de Voz</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "voz" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Radio className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.voice}`} />
              )}
            </button>
            {sidebarOpen && expandedMenu === "voz" && (
              <SidebarSubMenu pathname={pathname} items={AGENTES_VOZ_NAV} />
            )}
          </div>
          )}

          {/* Agentes de Texto */}
          {showTextoSection && (
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
                  <MessageSquare className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.text}`} />
                  <span className="flex-1 text-left">Agentes de Texto</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "texto" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <MessageSquare className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.text}`} />
              )}
            </button>
            {sidebarOpen && expandedMenu === "texto" && (
              <SidebarSubMenu pathname={pathname} items={textoNavItems} />
            )}
          </div>
          )}

          {/* Canales */}
          {showCanalesSection && (
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
                  <Share2 className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.channels}`} />
                  <span className="flex-1 text-left">Canales</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "canales" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Share2 className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.channels}`} />
              )}
            </button>
            {sidebarOpen && expandedMenu === "canales" && (
              <SidebarSubMenu pathname={pathname} items={CANALES_NAV} />
            )}
          </div>
          )}

          {/* CRM */}
          {showCrmSection && (
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
                  <Contact className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.crm}`} />
                  <span className="flex-1 text-left">CRM</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "crm" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Contact className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.crm}`} />
              )}
            </button>
            {sidebarOpen && expandedMenu === "crm" && (
              <SidebarSubMenu pathname={pathname} items={CRM_NAV} />
            )}
          </div>
          )}

          {/* Campañas */}
          {showCampaignsSection && (
          <div>
            <button
              onClick={() => toggleMenu("campaigns")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "campaigns" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Campañas"
            >
              {sidebarOpen ? (
                <>
                  <Target className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.campaigns}`} />
                  <span className="flex-1 text-left">Campañas</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "campaigns" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Target className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.campaigns}`} />
              )}
            </button>
            {sidebarOpen && expandedMenu === "campaigns" && (
              <SidebarSubMenu pathname={pathname} items={CAMPAIGNS_NAV} />
            )}
          </div>
          )}

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
                <Bot className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.ori}`} />
                <div className="flex-1 flex items-center gap-2">
                  <span>ORI</span>
                  <Badge variant="accent">Copiloto</Badge>
                </div>
              </>
            ) : (
              <Bot className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.ori}`} />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2" />}

          {/* Contextos de marca */}
          {showContextsSection && (
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
                <Building2 className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.contexts}`} />
                <span className="flex-1 text-left">Contextos</span>
              </>
            ) : (
              <Building2 className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.contexts}`} />
            )}
          </Link>
          )}

          {/* Tablas de datos */}
          {showTablesSection && (
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
                <Database className={`w-5 h-5 mr-3 ${sidebarIconBase} ${sidebarNeonIcon.tables}`} />
                <span className="flex-1 text-left">Tablas</span>
              </>
            ) : (
              <Database className={`w-5 h-5 ${sidebarIconBase} ${sidebarNeonIcon.tables}`} />
            )}
          </Link>
          )}
        </nav>

        {/* Footer - Plan & Logout */}
        <div className={`${sidebarOpen ? "p-3 space-y-3" : "p-3 space-y-3"} border-t border-white/[.08]`}>
          {/* Plan Card */}
          {sidebarOpen && permFlags.can_view_billing && (() => {
            const pct   = billing?.usedPct ?? 0;
            const st    = billing?.status ?? "active";
            const badgeVariant: BadgeVariant =
              st === "active"    ? "emerald" :
              st === "trialing"  ? "sky"     :
              st === "past_due"  ? "amber"   :
              st === "suspended" ? "danger"  : "neutral";
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
                  <Badge variant={badgeVariant}>{badgeLabel}</Badge>
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
                      className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-[var(--nv-hubspot-teal)]" : "bg-[#5b5bf6]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })()}

          {/* Cuenta + Logout */}
          <div className={`flex items-center gap-2 ${sidebarOpen ? "" : "flex-col"}`}>
            <SidebarAccountMenu
              name={profileName}
              email={profileEmail}
              compact={!sidebarOpen}
              showBilling={permFlags.can_view_billing}
              showTeam={permFlags.can_view_team}
            />
            <button
              onClick={logout}
              className={`flex flex-1 items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all min-w-0 ${
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
        <DashboardRouteGuard>
          {children}
        </DashboardRouteGuard>
      </div>
    </div>
    </DesktopOnlyGate>
  );
}
