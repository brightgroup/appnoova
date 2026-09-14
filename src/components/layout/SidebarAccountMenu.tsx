"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contrast, CreditCard, Settings, User, Users } from "lucide-react";
import { sidebarIconBase } from "@/lib/sidebar-neon";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Switch } from "@/components/ui/Switch";

const MENU_ITEMS = [
  { href: "/dashboard/perfil", label: "Mi perfil", icon: User },
  { href: "/dashboard/configuracion", label: "Configuración", icon: Settings },
  { href: "/dashboard/facturacion", label: "Facturación", icon: CreditCard },
  { href: "/dashboard/equipo", label: "Usuarios", icon: Users },
] as const;

const MENU_WIDTH = 224; // w-56

interface SidebarAccountMenuProps {
  name?: string;
  email?: string;
  showBilling?: boolean;
  showTeam?: boolean;
}

/**
 * El popover se renderiza en un portal a document.body (no como hijo directo
 * del botón) — el <aside> del sidebar tiene overflow-hidden (necesario para
 * la animación de colapsar/expandir), así que un dropdown posicionado
 * normalmente quedaba cortado, sobre todo con el sidebar colapsado (w-20).
 * data-noova-dashboard/data-noova-sidebar se repiten en el wrapper del
 * portal porque el CSS de tema claro/oscuro de este menú depende de esos
 * selectores de ancestro (ver globals.css) — sin ellos el portal perdería
 * todo el theming.
 */
export function SidebarAccountMenu({
  name,
  email,
  showBilling = true,
  showTeam = true,
}: SidebarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { resolved, setPreference } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const visibleItems = MENU_ITEMS.filter(({ href }) => {
    if (href === "/dashboard/facturacion") return showBilling;
    if (href === "/dashboard/equipo") return showTeam;
    return true;
  });

  const accountActive = visibleItems.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const updatePosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 8;
    let left = rect.left;
    if (left + MENU_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    }
    setMenuPos({ left, bottom: window.innerHeight - rect.top + gap });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const menu =
    open && mounted && menuPos
      ? createPortal(
          // data-noova-dashboard/data-noova-sidebar van en este wrapper (no en el
          // menú mismo) porque las reglas de tema en globals.css son del tipo
          // "[data-noova-sidebar] .nv-sidebar-account-menu" — un selector de
          // DESCENDIENTE: si ambos quedan en el mismo elemento, nunca matchea.
          <div ref={menuRef} data-noova-dashboard data-noova-sidebar>
            <div
              role="menu"
              className="nv-sidebar-account-menu fixed z-[100] w-56 rounded-xl border p-1.5 shadow-xl"
              style={{ left: menuPos.left, bottom: menuPos.bottom }}
            >
            {(name || email) && (
              <div className="px-3 py-2.5 border-b border-white/[.08] mb-1">
                {name && <p className="text-sm font-semibold text-white truncate">{name}</p>}
                {email && <p className="text-[11px] text-white/60 truncate mt-0.5">{email}</p>}
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 mb-1 border-b border-white/[.08]">
              <span className="flex items-center gap-2.5 text-sm font-medium text-white/80">
                <Contrast className="w-4 h-4 shrink-0 opacity-90" strokeWidth={1.75} />
                Modo oscuro
              </span>
              <Switch
                checked={resolved === "dark"}
                onChange={checked => setPreference(checked ? "dark" : "light")}
              />
            </div>

            {visibleItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/[.14] text-white"
                      : "text-white/80 hover:bg-white/[.10] hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-90" strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative shrink-0">
      {menu}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Mi cuenta"
        aria-label="Mi cuenta"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`nv-sidebar-account-btn flex items-center justify-center rounded-lg p-2.5 transition-colors ${
          open || accountActive
            ? "text-white bg-white/[.08]"
            : "text-gray-300 hover:text-white hover:bg-white/[.06]"
        }`}
      >
        <User className={`w-5 h-5 ${sidebarIconBase}`} strokeWidth={1.75} />
      </button>
    </div>
  );
}
