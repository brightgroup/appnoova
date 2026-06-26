import type { SupabaseClient } from "@supabase/supabase-js";
import { publishPricingChange } from "@/lib/billing/pricing-revision";
import { DEFAULT_TRM_COP } from "@/lib/billing/pricing-defaults";

const TRM_DATASET_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const FETCH_CACHE_MS = 15 * 60 * 1000;

export interface ColombiaTrmQuote {
  trmCop: number;
  effectiveFrom: string;
  source: "datos.gov.co";
}

let cachedQuote: ColombiaTrmQuote | null = null;
let cachedAt = 0;

interface TrmRow {
  valor?: string;
  vigenciadesde?: string;
}

function parseSettingDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return String(value).replace(/^"|"$/g, "").slice(0, 10) || null;
}

/** TRM oficial del día (Superfinanciera vía datos.gov.co). */
export async function fetchColombiaTrmLatest(): Promise<ColombiaTrmQuote> {
  if (cachedQuote && Date.now() - cachedAt < FETCH_CACHE_MS) {
    return cachedQuote;
  }

  const url = `${TRM_DATASET_URL}?$order=vigenciadesde%20DESC&$limit=1`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`TRM oficial no disponible (${res.status})`);
  }

  const rows = (await res.json()) as TrmRow[];
  const row = rows[0];
  const trmCop = Number(row?.valor);
  if (!Number.isFinite(trmCop) || trmCop <= 0) {
    throw new Error("Respuesta TRM inválida");
  }

  const effectiveFrom = String(row?.vigenciadesde ?? "").slice(0, 10);
  const quote: ColombiaTrmQuote = {
    trmCop: Math.round(trmCop * 100) / 100,
    effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10),
    source: "datos.gov.co",
  };

  cachedQuote = quote;
  cachedAt = Date.now();
  return quote;
}

export interface SyncOfficialTrmResult {
  trmCop: number;
  effectiveFrom: string | null;
  updated: boolean;
  source: ColombiaTrmQuote["source"] | null;
  error?: string;
}

/** Sincroniza billing_settings con la TRM oficial si el valor o la fecha vigente difieren. */
export async function syncOfficialTrm(
  db: SupabaseClient,
  options?: { userId?: string | null }
): Promise<SyncOfficialTrmResult> {
  const [{ data: setting }, { data: meta }] = await Promise.all([
    db.from("billing_settings").select("value").eq("key", "trm_cop").maybeSingle(),
    db.from("billing_settings").select("value").eq("key", "trm_effective_date").maybeSingle(),
  ]);

  const currentTrm = Number(setting?.value);
  const storedDate = parseSettingDate(meta?.value);

  let quote: ColombiaTrmQuote;
  try {
    quote = await fetchColombiaTrmLatest();
  } catch (err) {
    const fallback = Number.isFinite(currentTrm) && currentTrm > 0 ? currentTrm : DEFAULT_TRM_COP;
    return {
      trmCop: fallback,
      effectiveFrom: storedDate,
      updated: false,
      source: null,
      error: err instanceof Error ? err.message : "Error al consultar TRM",
    };
  }

  const valueDiffers =
    !Number.isFinite(currentTrm) || Math.abs(currentTrm - quote.trmCop) >= 0.01;
  const dateDiffers = storedDate !== quote.effectiveFrom;
  const changed = valueDiffers || dateDiffers;

  if (changed) {
    const now = new Date().toISOString();
    const rows = [
      { key: "trm_cop", value: quote.trmCop, updated_at: now, updated_by: options?.userId ?? null },
      { key: "trm_effective_date", value: quote.effectiveFrom, updated_at: now, updated_by: options?.userId ?? null },
    ];
    const { error } = await db.from("billing_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await publishPricingChange(db, options?.userId);
  }

  return {
    trmCop: quote.trmCop,
    effectiveFrom: quote.effectiveFrom,
    updated: changed,
    source: quote.source,
  };
}
