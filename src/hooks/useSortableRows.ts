import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}

/**
 * Orden de columna client-side, genérico — primer clic ordena ascendente, un
 * segundo clic en la misma columna invierte, clic en otra columna reinicia en
 * ascendente. `getValue` decide qué comparar por cada key; números se comparan
 * numéricamente, todo lo demás como texto (localeCompare es-CO).
 */
export function useSortableRows<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => string | number | null | undefined
) {
  const [sort, setSort] = useState<SortState<K>>({ key: null, direction: "asc" });

  const toggleSort = (key: K) => {
    setSort(prev =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const mult = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a, key);
      const bv = getValue(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv), "es", { sensitivity: "base", numeric: true }) * mult;
    });
  }, [rows, sort, getValue]);

  return { sort, toggleSort, sorted };
}
