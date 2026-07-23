import { createSign } from "crypto";

/**
 * Auth alternativa a OAuth para el modo "hosted": una cuenta de servicio de
 * Google Cloud con delegación de dominio completo (autorizada una sola vez
 * en el panel de Workspace Admin) puede actuar como cualquier usuario del
 * dominio sin pasar por la pantalla de consentimiento — así que no hereda
 * el vencimiento de 7 días de los refresh tokens en modo Prueba de Google.
 * Flujo JWT Bearer estándar (RFC 7523), firmado con la llave privada de la
 * cuenta de servicio.
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedKey: ServiceAccountKey | null | undefined;

function getServiceAccountKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64?.trim();
  if (!raw) {
    cachedKey = null;
    return null;
  }
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccountKey;
    cachedKey = parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export function isServiceAccountConfigured(): boolean {
  return Boolean(getServiceAccountKey());
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(key: ServiceAccountKey, impersonateEmail: string, scope: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: key.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    sub: impersonateEmail,
    iat: nowSec,
    exp: nowSec + 3600
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  return `${unsigned}.${base64url(signature)}`;
}

const tokenCache = new Map<string, { accessToken: string; expiresAtMs: number }>();

/** Token de acceso delegado (suplanta a `impersonateEmail`), cacheado en memoria hasta ~5 min antes de vencer. */
export async function mintDelegatedAccessToken(
  impersonateEmail: string,
  scope: string
): Promise<{ accessToken: string; expiresInSec: number }> {
  const key = getServiceAccountKey();
  if (!key) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 (cuenta de servicio no configurada)");

  const cacheKey = `${impersonateEmail}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - Date.now() > 5 * 60_000) {
    return { accessToken: cached.accessToken, expiresInSec: Math.floor((cached.expiresAtMs - Date.now()) / 1000) };
  }

  const assertion = signJwt(key, impersonateEmail, scope);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Error obteniendo token delegado (${res.status})`);
  }

  const expiresInSec = json.expires_in ?? 3600;
  tokenCache.set(cacheKey, { accessToken: json.access_token, expiresAtMs: Date.now() + expiresInSec * 1000 });
  return { accessToken: json.access_token, expiresInSec };
}
