import { metaGraphBaseUrl, getMetaAppId, getMetaAppSecret } from "@/lib/meta/graph-config";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";

export interface MetaOAuthTokenResult {
  accessToken: string;
  tokenType?: string;
}

/** Intercambia el código OAuth de Embedded Signup por access token. */
export async function exchangeMetaEmbeddedSignupCode(code: string): Promise<MetaOAuthTokenResult> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID y META_APP_SECRET requeridos para intercambiar el código OAuth");
  }

  const url = new URL(`${metaGraphBaseUrl()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error?.message || `Meta OAuth error ${res.status}`);
  }

  return { accessToken: json.access_token, tokenType: json.token_type };
}

/** Suscribe la app al WABA para recibir webhooks de mensajes. */
export async function subscribeMetaAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${metaGraphBaseUrl()}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (!res.ok && json.success !== true) {
    throw new Error(json.error?.message || `Meta subscribed_apps error ${res.status}`);
  }
}

/** Obtiene display_phone_number y valida phone_number_id. */
export async function fetchMetaPhoneNumberDetails(
  phoneNumberId: string,
  accessToken: string
): Promise<{ e164: string; displayPhoneNumber: string | null }> {
  const res = await fetch(`${metaGraphBaseUrl()}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const json = (await res.json().catch(() => ({}))) as {
    display_phone_number?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `Meta phone number fetch error ${res.status}`);
  }

  const display = json.display_phone_number?.trim() || null;
  const e164 = display ? normalizeWhatsAppE164(display) : "";
  if (!e164) {
    throw new Error("No se pudo resolver el número E.164 desde Meta Graph API");
  }

  return { e164, displayPhoneNumber: display };
}
