"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Settings, User, Users } from "lucide-react";
import { sidebarIconBase } from "@/lib/sidebar-neon";

const MENU_ITEMS = [
  { href: "/dashboard/perfil", label: "Mi perfil", icon: User },
  { href: "/dashboard/configuracion", label: "Configuración", icon: Settings },
  { href: "/dashboard/facturacion", label: "Facturación", icon: CreditCard },
  { href: "/dashboard/equipo", label: "Usuarios", icon: Users },
] as const;

interface SidebarAccountMenuProps {
  name?: string;
  email?: string;
  compact?: boolean;
}

export function SidebarAccountMenu({
  name,
  email,
  compact = false,
}: SidebarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const accountActive = MENU_ITEMS.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      {open && (
        <div
          className={`nv-sidebar-account-menu absolute z-50 mb-2 w-56 rounded-xl border p-1.5 shadow-xl ${
            compact ? "left-0 bottom-full" : "left-0 bottom-full"
          }`}
          role="menu"
        >
          {(name || email) && (
            <div className="px-3 py-2.5 border-b border-white/[.08] mb-1">
              {name && (
                <p className="text-sm font-semibold text-white truncate">{name}</p>
              )}
              {email && (
                <p className="text-[11px] text-white/60 truncate mt-0.5">{email}</p>
              )}
            </div>
          )}
          {MENU_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
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
      )}

      <button
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
