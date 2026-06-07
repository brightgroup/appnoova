import type { TelephonyProvider } from "@/types/phone-number";
import { getAppBaseUrl } from "@/lib/telephony/app-url";

export function voiceWebhookUrl(provider: TelephonyProvider): string {
  const base = getAppBaseUrl();
  if (provider === "telnyx") return `${base}/api/telephony/webhooks/telnyx/voice`;
  return `${base}/api/telephony/webhooks/twilio/voice`;
}
