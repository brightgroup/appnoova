"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Controles de paginación estándar para tablas de registro */
export function RegistryTablePagination({
  total,
  rangeStart,
  rangeEnd,
  pageSafe,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  label = "registros",
}: RegistryTablePaginationProps) {
  if (total === 0) return null;

  return (
    <>
      <span>
        Mostrando {rangeStart} a {rangeEnd} de {total} {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pageSafe <= 1}
          onClick={() => onPageChange(p => Math.max(1, p - 1))}
          className="p-1 rounded hover:bg-white/[.08] disabled:opacity-30"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="w-6 h-6 rounded-full bg-white/[.10] text-white flex items-center justify-center text-[11px]">
          {pageSafe}
        </span>
        <button
          type="button"
          disabled={pageSafe >= totalPages}
          onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
          className="p-1 rounded hover:bg-white/[.08] disabled:opacity-30"
          aria-label="Página siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <NoovaSelect
          value={String(pageSize)}
          onChange={v => onPageSizeChange(Number(v))}
          allowEmpty={false}
          className="ml-2 w-[72px]"
          options={REGISTRY_PAGE_SIZES.map(s => ({ value: String(s), label: String(s) }))}
        />
      </div>
    </>
  );
}
