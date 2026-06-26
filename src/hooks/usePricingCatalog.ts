"use client";

import { useCallback, useEffect, useState } from "react";

export interface PricingCatalogUnit {
  event_type: string;
  label: string;
  unit_label: string;
  category: string;
  price_usd: number;
  credits: number;
  cop_reference: number;
}

export interface PricingCatalogPlan {
  id: string;
  name: string;
  price_usd: number;
  monthly_credits: number;
  trial_days: number;
  sort_order: number;
}

export interface PricingCatalog {
  revision: number;
  credit_usd_value: number;
  trm_cop: number;
  unit_prices: PricingCatalogUnit[];
  voice_standard_per_min: number;
  voice_premium_per_min: number;
  plans: PricingCatalogPlan[];
}

const CATALOG_CHANGED_EVENT = "pricing-catalog-changed";
const POLL_MS = 8_000;

let lastRevision = 0;

export function usePricingCatalog() {
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/pricing/catalog", { cache: "no-store" });
      const json = (await res.json()) as PricingCatalog;
      if (!res.ok) return;

      const revision = Number(json.revision ?? 0);
      if (!silent || revision !== lastRevision) {
        lastRevision = revision;
        setCatalog(json);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const onChanged = () => void load(true);
    const onFocus = () => void load(true);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);

    window.addEventListener(CATALOG_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener(CATALOG_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  return { catalog, loading, reload: () => load(false) };
}

/** Invalida caché local y notifica a todos los hooks para recargar el catálogo. */
export function invalidatePricingCatalogCache() {
  lastRevision = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CATALOG_CHANGED_EVENT));
  }
}
