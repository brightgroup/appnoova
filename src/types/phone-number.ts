export type TelephonyProvider = "twilio" | "telnyx" | "vapi";
export type PhoneNumberType = "purchased" | "verified_caller_id" | "ported";
export type PhoneNumberStatus = "pending" | "active" | "suspended" | "released";

export interface PhoneNumberCapabilities {
  voice: boolean;
  sms: boolean;
}

export interface PhoneNumberRecord {
  id: string;
  user_id: string;
  voice_agent_id: string | null;
  provider: TelephonyProvider;
  provider_sid: string;
  provider_account_ref: string | null;
  e164: string;
  friendly_name: string | null;
  country_code: string;
  number_type: PhoneNumberType;
  status: PhoneNumberStatus;
  capabilities: PhoneNumberCapabilities;
  inbound_webhook_url: string | null;
  voice_config: Record<string, unknown>;
  monthly_cost_usd: number | null;
  assigned_by: string | null;
  assigned_at: string;
  released_at: string | null;
  /** ID remoto ElevenLabs (import SIP) — voz premium */
  elevenlabs_phone_number_id?: string | null;
  elevenlabs_sync_error?: string | null;
  elevenlabs_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhoneNumberRegion {
  name: string;
  type: string;
}

export interface AvailablePhoneNumber {
  e164: string;
  friendly_name: string;
  locality: string | null;
  region: string | null;
  country_code: string;
  number_type?: string | null;
  regions?: PhoneNumberRegion[];
  capabilities: PhoneNumberCapabilities;
  feature_list?: string[];
  monthly_cost_usd: number | null;
  upfront_cost_usd?: number | null;
  currency?: string | null;
  quickship?: boolean;
  reservable?: boolean;
  best_effort?: boolean;
}
