import type { TelephonyProvider } from "@/types/phone-number";
import { twilioProvider } from "@/lib/telephony/twilio-provider";
import { telnyxProvider } from "@/lib/telephony/telnyx-provider";
import type { TelephonyProviderAdapter } from "@/lib/telephony/types";

const PROVIDERS: Record<TelephonyProvider, TelephonyProviderAdapter> = {
  twilio: twilioProvider,
  telnyx: telnyxProvider,
  vapi: {
    id: "vapi",
    isConfigured: () => Boolean(process.env.VAPI_API_KEY),
    searchAvailable: async () => { throw new Error("Vapi: próximamente"); },
    purchaseNumber: async () => { throw new Error("Vapi: próximamente"); },
    releaseNumber: async () => { throw new Error("Vapi: próximamente"); },
    configureInboundWebhook: async () => { throw new Error("Vapi: próximamente"); }
  }
};

export function getDefaultProviderId(): TelephonyProvider {
  return (process.env.TELEPHONY_PROVIDER as TelephonyProvider | undefined) ?? "telnyx";
}

export function getTelephonyProvider(id?: TelephonyProvider): TelephonyProviderAdapter {
  return PROVIDERS[id ?? getDefaultProviderId()];
}

export function listConfiguredProviders(): TelephonyProvider[] {
  return (Object.values(PROVIDERS) as TelephonyProviderAdapter[])
    .filter(p => p.isConfigured())
    .map(p => p.id);
}

export { getAppBaseUrl, twilioVoiceWebhookUrl, twilioStatusWebhookUrl } from "@/lib/telephony/app-url";
export { voiceWebhookUrl } from "@/lib/telephony/webhooks";
