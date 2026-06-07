import type { AvailablePhoneNumber } from "@/types/phone-number";
import { twilioStatusWebhookUrl, twilioVoiceWebhookUrl } from "@/lib/telephony/app-url";
import type {
  PurchaseNumberInput,
  PurchasedNumberResult,
  TelephonyProviderAdapter
} from "@/lib/telephony/types";

function credentials(): { accountSid: string; authToken: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function twilioFetch<T>(
  path: string,
  init?: RequestInit & { form?: Record<string, string> }
): Promise<T> {
  const creds = credentials();
  if (!creds) throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");

  const headers: Record<string, string> = {
    Authorization: authHeader(creds.accountSid, creds.authToken)
  };

  let body: string | undefined;
  if (init?.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body ?? init?.body
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error_message || res.statusText;
    throw new Error(`Twilio: ${msg}`);
  }
  return json as T;
}

function mapAvailable(row: Record<string, unknown>, country_code: string): AvailablePhoneNumber {
  const caps = (row.capabilities as Record<string, boolean> | undefined) ?? {};
  const voice = Boolean(caps.voice);
  const sms = Boolean(caps.SMS ?? caps.sms);
  return {
    e164: String(row.phone_number ?? ""),
    friendly_name: String(row.friendly_name ?? row.phone_number ?? ""),
    locality: row.locality ? String(row.locality) : null,
    region: row.region ? String(row.region) : null,
    country_code,
    number_type: "local",
    capabilities: { voice, sms },
    feature_list: [voice ? "voice" : null, sms ? "sms" : null].filter(Boolean) as string[],
    monthly_cost_usd: null,
    currency: "USD"
  };
}

export const twilioProvider: TelephonyProviderAdapter = {
  id: "twilio",

  isConfigured() {
    return credentials() !== null;
  },

  async searchAvailable({ country_code, area_code, contains, limit = 10 }) {
    const params = new URLSearchParams({ PageSize: String(Math.min(limit, 30)) });
    if (area_code) params.set("AreaCode", area_code);
    if (contains) params.set("Contains", contains);

    const data = await twilioFetch<{ available_phone_numbers?: Record<string, unknown>[] }>(
      `/AvailablePhoneNumbers/${country_code}/Local.json?${params.toString()}`
    );

    return {
      numbers: (data.available_phone_numbers ?? []).slice(0, limit).map(r => mapAvailable(r, country_code))
    };
  },

  async purchaseNumber(input: PurchaseNumberInput): Promise<PurchasedNumberResult> {
    const creds = credentials()!;
    const voiceUrl = input.voice_webhook_url || twilioVoiceWebhookUrl();

    const data = await twilioFetch<Record<string, unknown>>("/IncomingPhoneNumbers.json", {
      method: "POST",
      form: {
        PhoneNumber: input.e164,
        FriendlyName: input.friendly_name ?? input.e164,
        VoiceUrl: voiceUrl,
        VoiceMethod: "POST",
        StatusCallback: twilioStatusWebhookUrl(),
        StatusCallbackMethod: "POST"
      }
    });

    const caps = (data.capabilities as Record<string, boolean> | undefined) ?? {};
    return {
      provider: "twilio",
      provider_sid: String(data.sid),
      provider_account_ref: creds.accountSid,
      e164: String(data.phone_number),
      friendly_name: data.friendly_name ? String(data.friendly_name) : null,
      country_code: input.country_code,
      inbound_webhook_url: voiceUrl,
      monthly_cost_usd: null,
      capabilities: { voice: Boolean(caps.voice), sms: Boolean(caps.SMS ?? caps.sms) },
      voice_config: { twilio: { sid: data.sid } }
    };
  },

  async releaseNumber(provider_sid: string) {
    await twilioFetch(`/IncomingPhoneNumbers/${provider_sid}.json`, { method: "DELETE" });
  },

  async configureInboundWebhook(provider_sid: string, voice_webhook_url: string) {
    await twilioFetch(`/IncomingPhoneNumbers/${provider_sid}.json`, {
      method: "POST",
      form: {
        VoiceUrl: voice_webhook_url,
        VoiceMethod: "POST",
        StatusCallback: twilioStatusWebhookUrl(),
        StatusCallbackMethod: "POST"
      }
    });
  }
};
