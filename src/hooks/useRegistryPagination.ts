import { useEffect, useMemo, useState } from "react";

export const REGISTRY_PAGE_SIZES = [10, 25, 50] as const;
export const REGISTRY_DEFAULT_PAGE_SIZE = 25;

export interface RegistryPaginationState {
  page: number;
  setPage: (page: number | ((prev: number) => number)) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageSafe: number;
  totalPages: number;
  pageRows: <T>(items: T[]) => T[];
  total: number;
  rangeStart: number;
  rangeEnd: number;
}

export function useRegistryPagination(
  total: number,
  resetKey?: unknown
): RegistryPaginationState {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(REGISTRY_DEFAULT_PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const rangeEnd = Math.min(pageSafe * pageSize, total);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const sliceStart = (pageSafe - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;

  const pageRows = useMemo(
    () =>
      function paginateRows<T>(items: T[]): T[] {
        return items.slice(sliceStart, sliceEnd);
      },
    [sliceStart, sliceEnd]
  );

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageSafe,
    totalPages,
    pageRows,
    total,
    rangeStart,
    rangeEnd,
  };
}
