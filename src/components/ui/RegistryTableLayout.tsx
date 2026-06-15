"use client";

import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import {
  btnIcon, inputSearch, registryPanel, registrySearchRow,
  registryTableArea, registryTableFooter
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
  const showSearchRow = onSearchChange !== undefined || onRefresh || action;
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
    <div className={registryPanel}>
      {alerts}
      {filters && <div className="mb-4">{filters}</div>}
      {showSearchRow && (
        <div className={registrySearchRow}>
          {onSearchChange !== undefined && (
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className={inputSearch}
              />
            </div>
          )}
          {onRefresh && (
            <button onClick={onRefresh} className={btnIcon} title="Actualizar">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
          {action}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className={registryTableArea}>{children}</div>
      {footer && <div className={registryTableFooter}>{footer}</div>}
    </div>
  );
}
