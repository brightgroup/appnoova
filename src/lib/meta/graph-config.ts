/** Configuración servidor para Meta Graph / Cloud API. */

import { getAppBaseUrl } from "@/lib/telephony/app-url";

export const META_GRAPH_API_VERSION = "v22.0";

export function metaGraphBaseUrl(): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
}

export function getMetaAppSecret(): string | null {
  return process.env.META_APP_SECRET?.trim() || null;
}

export function getMetaAppId(): string | null {
  return (
    process.env.META_APP_ID?.trim()
    || process.env.NEXT_PUBLIC_META_APP_ID?.trim()
    || null
  );
}

export function getMetaWebhookVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null;
}

export function metaWhatsAppWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/webhooks/meta/whatsapp`;
}

export function isMetaWhatsAppDirectConfigured(): boolean {
  return Boolean(getMetaAppId() && getMetaAppSecret() && getMetaWebhookVerifyToken());
}
