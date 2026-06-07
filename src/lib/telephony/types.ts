import type { AvailablePhoneNumber, TelephonyProvider } from "@/types/phone-number";

export interface SearchAvailableParams {
  country_code: string;
  area_code?: string;
  contains?: string;
  limit?: number;
  /** Telnyx filter[phone_number_type] — omitir = todos los tipos */
  phone_number_type?: string | null;
  /** Telnyx filter[features] — omitir = sin filtrar por feature */
  features?: string[];
  /** Incluir resultados best-effort (US/CA). Default true para US/CA. */
  best_effort?: boolean;
}

export interface SearchAvailableResult {
  numbers: AvailablePhoneNumber[];
  total_results?: number;
}

export interface PurchaseNumberInput {
  e164: string;
  country_code: string;
  voice_webhook_url: string;
  friendly_name?: string;
}

export interface PurchasedNumberResult {
  provider: TelephonyProvider;
  provider_sid: string;
  provider_account_ref: string | null;
  e164: string;
  friendly_name: string | null;
  country_code: string;
  inbound_webhook_url: string;
  monthly_cost_usd: number | null;
  capabilities: AvailablePhoneNumber["capabilities"];
  voice_config: Record<string, unknown>;
}

export interface TelephonyProviderAdapter {
  readonly id: TelephonyProvider;
  isConfigured(): boolean;
  searchAvailable(params: SearchAvailableParams): Promise<SearchAvailableResult>;
  purchaseNumber(input: PurchaseNumberInput): Promise<PurchasedNumberResult>;
  releaseNumber(provider_sid: string): Promise<void>;
  configureInboundWebhook(provider_sid: string, voice_webhook_url: string): Promise<void>;
}
