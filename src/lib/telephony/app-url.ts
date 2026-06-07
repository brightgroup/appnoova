/** URL pública de la app (webhooks Twilio/Vapi). */
export function getAppBaseUrl(): string {
  if (process.env.NOOVA_APP_URL) return process.env.NOOVA_APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:8000";
}

export function twilioVoiceWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/telephony/webhooks/twilio/voice`;
}

export function twilioStatusWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/telephony/webhooks/twilio/status`;
}
