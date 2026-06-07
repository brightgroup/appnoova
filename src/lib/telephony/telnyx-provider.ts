import type { AvailablePhoneNumber } from "@/types/phone-number";
import { voiceWebhookUrl } from "@/lib/telephony/webhooks";
import { normalizeTelnyxFeatures } from "@/lib/telephony/feature-labels";
import type {
  PurchaseNumberInput,
  PurchasedNumberResult,
  SearchAvailableParams,
  SearchAvailableResult,
  TelephonyProviderAdapter
} from "@/lib/telephony/types";

function apiKey(): string | null {
  return process.env.TELNYX_API_KEY?.trim() || null;
}

function connectionId(): string | null {
  return process.env.TELNYX_CONNECTION_ID?.trim() || null;
}

async function telnyxFetch<T>(
  path: string,
  init?: RequestInit & { json?: Record<string, unknown> }
): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("Telnyx no configurado — agrega TELNYX_API_KEY en .env.local");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json"
  };

  let body: string | undefined;
  if (init?.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body ?? init?.body
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = json.errors as { detail?: string; title?: string }[] | undefined;
    const msg = errs?.[0]?.detail || errs?.[0]?.title || json.message || res.statusText;
    throw new Error(`Telnyx: ${msg}`);
  }
  return json as T;
}

function inferNumberType(e164: string): string {
  if (/^\+1(800|833|844|855|866|877|888)/.test(e164)) return "toll_free";
  if (/^\+57(800|801)/.test(e164)) return "toll_free";
  return "local";
}

function mapAvailable(row: Record<string, unknown>, country_code: string): AvailablePhoneNumber {
  const cost = row.cost_information as {
    monthly_cost?: string;
    upfront_cost?: string;
    currency?: string;
  } | undefined;
  const regionRows = (row.region_information as { region_name?: string; region_type?: string }[] | undefined) ?? [];
  const regions = regionRows
    .filter(r => r.region_name && r.region_type)
    .map(r => ({ name: r.region_name!, type: r.region_type! }));
  const locationParts = regions
    .filter(r => !["country_code", "country"].includes(r.type))
    .map(r => r.name);
  const featureNames = normalizeTelnyxFeatures(row.features as { name?: string }[] | undefined);
  const rateCenter = regions.find(r => r.type === "rate_center")?.name;
  const state = regions.find(r => r.type === "state")?.name;
  const e164 = String(row.phone_number ?? "");

  return {
    e164,
    friendly_name: e164,
    locality: rateCenter ?? locationParts.find(p => p !== state) ?? locationParts[0] ?? null,
    region: state ?? null,
    country_code,
    number_type: inferNumberType(e164),
    regions,
    capabilities: {
      voice: featureNames.includes("voice"),
      sms: featureNames.includes("sms")
    },
    feature_list: featureNames,
    monthly_cost_usd: cost?.monthly_cost ? Number(cost.monthly_cost) : null,
    upfront_cost_usd: cost?.upfront_cost ? Number(cost.upfront_cost) : null,
    currency: cost?.currency ?? "USD",
    quickship: row.quickship === true,
    reservable: row.reservable === true,
    best_effort: row.best_effort === true
  };
}

function buildSearchQuery({
  country_code,
  area_code,
  contains,
  limit = 25,
  phone_number_type,
  features,
  best_effort
}: SearchAvailableParams): URLSearchParams {
  const params = new URLSearchParams();
  params.set("filter[country_code]", country_code);
  params.set("filter[limit]", String(Math.min(limit, 50)));

  // Telnyx portal usa "local" por defecto; null = todos los tipos
  const numberType = phone_number_type === undefined ? "local" : phone_number_type;
  if (numberType) {
    params.set("filter[phone_number_type]", numberType);
  }

  if (features?.length) {
    for (const feature of features) {
      params.append("filter[features]", feature);
    }
  }

  const useBestEffort = best_effort ?? (country_code === "US" || country_code === "CA");
  if (useBestEffort && (country_code === "US" || country_code === "CA")) {
    params.set("filter[best_effort]", "true");
  }

  if (area_code) {
    const trimmed = area_code.trim();
    if ((country_code === "US" || country_code === "CA") && /^[A-Za-z]{2}$/.test(trimmed)) {
      params.set("filter[administrative_area]", trimmed.toUpperCase());
    } else {
      params.set("filter[national_destination_code]", trimmed.replace(/\D/g, ""));
    }
  }

  if (contains) {
    params.set("filter[phone_number][contains]", contains.replace(/\D/g, ""));
  }

  return params;
}

async function findPhoneNumberId(e164: string): Promise<string | null> {
  const data = await telnyxFetch<{ data: { id: string; phone_number: string }[] }>(
    `/phone_numbers?filter[phone_number]=${encodeURIComponent(e164)}`
  );
  return data.data?.[0]?.id ?? null;
}

async function assignConnection(phoneNumberId: string) {
  const conn = connectionId();
  if (!conn) return;
  await telnyxFetch(`/phone_numbers/${phoneNumberId}`, {
    method: "PATCH",
    json: { connection_id: conn }
  });
}

export const telnyxProvider: TelephonyProviderAdapter = {
  id: "telnyx",

  isConfigured() {
    return apiKey() !== null;
  },

  async searchAvailable(input): Promise<SearchAvailableResult> {
    const params = buildSearchQuery(input);
    const data = await telnyxFetch<{
      data: Record<string, unknown>[];
      meta?: { total_results?: number };
      metadata?: { total_results?: number };
    }>(`/available_phone_numbers?${params.toString()}`);

    const limit = Math.min(input.limit ?? 25, 50);
    const numbers = (data.data ?? []).slice(0, limit).map(r => mapAvailable(r, input.country_code));
    const meta = data.meta ?? data.metadata;

    return {
      numbers,
      total_results: meta?.total_results
    };
  },

  async purchaseNumber(input: PurchaseNumberInput): Promise<PurchasedNumberResult> {
    const order = await telnyxFetch<{ data: { id: string; status?: string } }>("/number_orders", {
      method: "POST",
      json: {
        phone_numbers: [{ phone_number: input.e164 }]
      }
    });

    let phoneId: string | null = null;
    for (let i = 0; i < 5; i++) {
      phoneId = await findPhoneNumberId(input.e164);
      if (phoneId) break;
      await new Promise(r => setTimeout(r, 3000));
    }

    if (phoneId) {
      try {
        await assignConnection(phoneId);
      } catch {
        /* connection opcional */
      }
    }

    return {
      provider: "telnyx",
      provider_sid: phoneId ?? order.data.id,
      provider_account_ref: order.data.id,
      e164: input.e164,
      friendly_name: input.friendly_name ?? input.e164,
      country_code: input.country_code,
      inbound_webhook_url: voiceWebhookUrl("telnyx"),
      monthly_cost_usd: null,
      capabilities: { voice: true, sms: false },
      voice_config: {
        telnyx: {
          number_order_id: order.data.id,
          phone_number_id: phoneId,
          connection_id: connectionId()
        }
      }
    };
  },

  async releaseNumber(provider_sid: string) {
    await telnyxFetch(`/phone_numbers/${provider_sid}`, { method: "DELETE" });
  },

  async configureInboundWebhook(provider_sid: string, _voice_webhook_url: string) {
    await assignConnection(provider_sid);
  }
};

export function telnyxConfigStatus() {
  const key = apiKey();
  return {
    configured: Boolean(key),
    has_connection: Boolean(connectionId()),
    missing: [
      !key ? "TELNYX_API_KEY" : null,
    ].filter(Boolean) as string[]
  };
}
