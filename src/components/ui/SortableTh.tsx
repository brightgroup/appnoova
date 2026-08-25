"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { registryTableHeadCell } from "@/lib/brand-ui";
import type { SortDirection } from "@/hooks/useSortableRows";

interface SortableThProps<K extends string> {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: SortDirection;
  onSort: (key: K) => void;
  className?: string;
}

/** Encabezado de columna clicable — mismo `registryTableHeadCell` que el resto de la tabla, solo agrega el ícono y el handler. */
export function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = ""
}: SortableThProps<K>) {
  const active = activeKey === sortKey;
  return (
    <th className={`${registryTableHeadCell} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-white transition-colors"
      >
        {label}
        {active ? (
          direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </th>
  );
}
