"use client";

import { formatDateCol } from "@/lib/format-datetime";
import { useMounted } from "@/hooks/useMounted";

export function ClientDate({ iso, fallback = "—" }: { iso: string | null | undefined; fallback?: string }) {
  const mounted = useMounted();
  if (!iso) return <>{fallback}</>;
  if (!mounted) return <>{fallback}</>;
  return <>{formatDateCol(iso)}</>;
}
