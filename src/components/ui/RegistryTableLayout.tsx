"use client";

import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import {
  inputSearch, registryPanel,
  registryTableWrap, registryTableFooter
} from "@/lib/brand-ui";

interface RegistryTableLayoutProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  action?: React.ReactNode;
  filters?: React.ReactNode;
  alerts?: React.ReactNode;
  error?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** Layout de tabla — réplica exacta de Números de prueba */
export function RegistryTableLayout({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar",
  onRefresh,
  refreshing,
  action,
  filters,
  alerts,
  error,
  footer,
  children
}: RegistryTableLayoutProps) {
  const showSearchRow = onSearchChange !== undefined || action;
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

  return (
    <div className={`${registryPanel} flex flex-col flex-1 min-h-0`}>
      {alerts}
      {filters && <div className="mb-4">{filters}</div>}
      {showSearchRow && (
        <div className="flex items-center gap-3 mb-4">
          {onSearchChange !== undefined && (
            <div className="relative flex-1 min-w-0 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className={`${inputSearch} ${onRefresh ? "pr-10" : ""}`}
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
          )}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className={registryTableWrap}>{children}</div>
      {footer && <div className={registryTableFooter}>{footer}</div>}
    </div>
  );
}
