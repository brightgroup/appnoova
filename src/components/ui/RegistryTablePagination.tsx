"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { REGISTRY_PAGE_SIZES } from "@/hooks/useRegistryPagination";

interface RegistryTablePaginationProps {
  total: number;
  rangeStart: number;
  rangeEnd: number;
  pageSafe: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
}

const pageSizeOptions = REGISTRY_PAGE_SIZES.map(n => ({ value: String(n), label: String(n) }));

/** Paginación centrada — flechas + filas por página en una sola barra. */
export function RegistryTablePagination({
  total,
  pageSafe,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: RegistryTablePaginationProps) {
  if (total === 0) return null;

  const go = (page: number) => onPageChange(Math.min(totalPages, Math.max(1, page)));
  const safeSize = REGISTRY_PAGE_SIZES.includes(pageSize as (typeof REGISTRY_PAGE_SIZES)[number])
    ? pageSize
    : 25;

  return (
    <div className="flex justify-center w-full select-none" role="navigation" aria-label="Paginación de tabla">
      <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg-elevated)] shadow-[var(--nv-shadow-sm)]">
        <NavBtn disabled={pageSafe <= 1} onClick={() => go(1)} label="Primera página">
          <ChevronsLeft className="w-4 h-4" strokeWidth={1.75} />
        </NavBtn>
        <NavBtn disabled={pageSafe <= 1} onClick={() => go(pageSafe - 1)} label="Página anterior">
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </NavBtn>

        <span
          className="w-8 h-8 rounded-full bg-white/[.08] flex items-center justify-center text-sm font-medium text-white tabular-nums mx-0.5"
          aria-current="page"
          aria-label={`Página ${pageSafe} de ${totalPages}`}
        >
          {pageSafe}
        </span>

        <NavBtn disabled={pageSafe >= totalPages} onClick={() => go(pageSafe + 1)} label="Página siguiente">
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </NavBtn>
        <NavBtn disabled={pageSafe >= totalPages} onClick={() => go(totalPages)} label="Última página">
          <ChevronsRight className="w-4 h-4" strokeWidth={1.75} />
        </NavBtn>

        <span className="w-px h-5 bg-[var(--nv-border-strong)] mx-1.5 shrink-0" aria-hidden />

        <NoovaSelect
          value={String(safeSize)}
          onChange={v => onPageSizeChange(Number(v))}
          allowEmpty={false}
          className="min-w-[4.75rem] w-[4.75rem] shrink-0 [&_button]:h-8 [&_button]:min-h-8 [&_button]:py-0 [&_button]:px-2 [&_button]:text-xs [&_button]:rounded-xl [&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button_span]:truncate-none [&_button_span]:overflow-visible [&_button_span]:text-center [&_button]:justify-center [&_button]:gap-1"
          options={pageSizeOptions}
        />
      </div>
    </div>
  );
}

function NavBtn({
  children,
  disabled,
  onClick,
  label
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-25 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}
