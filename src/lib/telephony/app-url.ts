/** URL pública de la app (webhooks Twilio/Vapi). */
export function getAppBaseUrl(): string {
  if (process.env.NOOVA_APP_URL) return process.env.NOOVA_APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:8000";
}

/** Base URL para webhooks entrantes (Twilio, Meta). Prioriza NOOVA_WEBHOOK_BASE_URL. */
export function getWebhookBaseUrl(): string {
  const explicit = process.env.NOOVA_WEBHOOK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return getAppBaseUrl();
}

/** Prefijo fijo de la URL de entrada de un conector (el path lo elige el usuario). */
export function automationInboundBaseUrl(): string {
  return `${getWebhookBaseUrl()}/api/automations/inbound`;
}

export function twilioVoiceWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/telephony/webhooks/twilio/voice`;
}

export function twilioStatusWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/telephony/webhooks/twilio/status`;
}

export function twilioWhatsAppWebhookUrl(): string {
  return `${getWebhookBaseUrl()}/api/telephony/webhooks/twilio/whatsapp`;
}

export function twilioWhatsAppStatusWebhookUrl(): string {
  return `${getWebhookBaseUrl()}/api/telephony/webhooks/twilio/whatsapp/status`;
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

/** URL que Telnyx usa en streaming_start. Pipecat primero; DIY solo si no hay PIPECAT_WS_URL. */
export function telnyxStreamUrl(): string {
  return pipecatMediaStreamWsUrl() ?? telnyxMediaStreamWsUrl();
}

export function telephonyBridgeMode(): "pipecat" | "diy" {
  return pipecatMediaStreamWsUrl() ? "pipecat" : "diy";
}
