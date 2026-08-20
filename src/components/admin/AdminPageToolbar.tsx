"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, Search, RefreshCw } from "lucide-react";
import { registryToolbar, textMuted, btnIcon, inputSearch } from "@/lib/brand-ui";

interface AdminPageToolbarProps {
  icon?: LucideIcon;
  backHref?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** Cabecera estándar de módulos admin — título, búsqueda y acciones en una sola franja. */
export function AdminPageToolbar({
  icon: Icon,
  backHref,
  title,
  subtitle,
  action,
  children,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar",
  onRefresh,
  refreshing,
}: AdminPageToolbarProps) {
  const [inputValue, setInputValue] = useState(search ?? "");

  useEffect(() => {
    setInputValue(search ?? "");
  }, [search]);

  useEffect(() => {
    if (!onSearchChange) return;
    const timer = window.setTimeout(() => {
      onSearchChange(inputValue);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [inputValue, onSearchChange]);

  const searchPadRight = onRefresh ? "pr-10" : "";

  return (
    <div className={registryToolbar}>
      <div className="flex items-center gap-3 min-w-0">
        {backHref ? (
          <Link href={backHref} className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
        ) : null}

        <div className="shrink-0 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {Icon ? <Icon className="w-5 h-5 text-[#0f7eff] shrink-0" /> : null}
            <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
          </div>
          {subtitle ? <p className={`text-xs ${textMuted} truncate`}>{subtitle}</p> : null}
        </div>

        {onSearchChange ? (
          <div className="relative flex-1 min-w-0 max-w-xl ml-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className={`${inputSearch} ${searchPadRight}`}
            />
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[.08] transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {!onSearchChange && onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={btnIcon}
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          ) : null}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}
