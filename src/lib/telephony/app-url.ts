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

export function twilioWhatsAppWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/telephony/webhooks/twilio/whatsapp`;
}

/** WebSocket DIY (Node server.ts) — fallback si no hay Pipecat. */
export function telnyxMediaStreamWsUrl(): string {
  const base = getAppBaseUrl().replace(/\/$/, "");
  const wsBase = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  return `${wsBase}/api/telephony/ws/telnyx-media`;
}

/** WebSocket Pipecat self-hosted (prioridad si PIPECAT_WS_URL está definido). */
export function pipecatMediaStreamWsUrl(): string | null {
  const url = process.env.PIPECAT_WS_URL?.trim();
  return url || null;
}

/** URL que Telnyx usa en streaming_start. */
export function telnyxStreamUrl(): string {
  return pipecatMediaStreamWsUrl() ?? telnyxMediaStreamWsUrl();
}

export function telephonyBridgeMode(): "pipecat" | "diy" {
  return pipecatMediaStreamWsUrl() ? "pipecat" : "diy";
}
