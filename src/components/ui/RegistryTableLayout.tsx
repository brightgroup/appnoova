"use client";

import { Search, RefreshCw } from "lucide-react";
import {
  btnIcon, inputSearch, registryPanel, registryDescription, registrySearchRow,
  registryTableArea, registryTableFooter
} from "@/lib/brand-ui";

interface RegistryTableLayoutProps {
  description?: string;
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
  description,
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

  return (
    <div className={registryPanel}>
      {description && <p className={registryDescription}>{description}</p>}
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
                value={search}
                onChange={e => onSearchChange(e.target.value)}
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
