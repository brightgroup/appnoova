"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Settings, Phone, LogOut,
  ChevronLeft, ChevronRight, Shield, Loader2, Building2, KeyRound, CreditCard
} from "lucide-react";
import {
  sidebarNavActive, sidebarNavIdle, sidebarIconActive, accentGradientIcon
} from "@/lib/brand-ui";

const NAV_ITEMS = [
  { href: "/admin",               label: "Panel",            icon: LayoutDashboard, exact: true },
  { href: "/admin/users",         label: "Usuarios",         icon: Users },
  { href: "/admin/organizations", label: "Organizaciones",   icon: Building2 },
  { href: "/admin/billing",       label: "Facturación",      icon: CreditCard },
  { href: "/admin/roles",         label: "Roles",            icon: KeyRound },
  { href: "/admin/telephony",     label: "Líneas telefónicas", icon: Phone, badgeKey: "telephony" as const },
  { href: "/admin/whatsapp",      label: "WhatsApp",         icon: Phone },
  { href: "/admin/templates",     label: "Agentes IA",       icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [checked, setChecked]     = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [denied, setDenied]       = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const pathname  = usePathname();
  const router    = useRouter();

  const loadPendingRequests = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/admin/telephony/requests", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setPendingRequests(data.pending_count ?? 0);
    }
  }, []);

  useEffect(() => {
    const ADMIN_CACHE_KEY = "noova_admin_ok";
    const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setAuthReady(true);
      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
        if (raw) {
          const { at } = JSON.parse(raw) as { at: number };
          if (Date.now() - at < ADMIN_CACHE_TTL_MS) {
            setChecked(true);
            loadPendingRequests();
            return;
          }
        }
      } catch {
        /* ignore cache parse errors */
      }

      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setDenied(true);
        router.replace("/dashboard");
        return;
      }

      try {
        sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({ at: Date.now() }));
      } catch {
        /* ignore quota errors */
      }

      setChecked(true);
      loadPendingRequests();
    });
  }, [router, loadPendingRequests]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const showShell = authReady && checked && !denied;

  const isActive = (item: typeof NAV_ITEMS[0]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="flex h-screen bg-[#0d0e14] text-white overflow-hidden" data-noova-admin>

      {showShell && (
      <aside className={`${collapsed ? "w-16" : "w-56"} bg-[#09090f] border-r border-white/[.08] flex flex-col transition-all duration-200`}>

        {/* Logo + collapse */}
        <div className={`flex items-center border-b border-white/[.08] h-14 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg ${accentGradientIcon} flex items-center justify-center flex-shrink-0`}>
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight">Admin</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-lg hover:bg-white/[.08] text-gray-500 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon   = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  active ? sidebarNavActive : sidebarNavIdle
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? sidebarIconActive : "text-gray-400"}`} />
                {!collapsed && (
                  <span className="flex items-center gap-2">
                    {item.label}
                    {"badgeKey" in item && item.badgeKey === "telephony" && pendingRequests > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                        {pendingRequests}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-white/[.08]">
          <Link
            href="/dashboard"
            title={collapsed ? "Ir al Dashboard" : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-white/[.05] transition-all mb-1"
          >
            <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Dashboard</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/[.08] transition-all"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>
      )}

      {/* Content — scroll único en main (sin cajas internas estrechas) */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
        {(!authReady || denied || !checked) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0d0e14] text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {!authReady ? "Cargando admin..." : "Redirigiendo..."}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
