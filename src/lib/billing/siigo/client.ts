/**
 * Cliente mínimo de la API de Siigo (https://api.siigo.com), equivalente en
 * TypeScript al `siigo_client.py` usado manualmente en ~/facturas. Sin cache
 * de token en disco (no tiene sentido en serverless) — reautentica en cada
 * invocación; esto solo corre una vez por pago confirmado, no es caliente.
 */

const BASE_URL = "https://api.siigo.com";

export class SiigoError extends Error {}

interface SiigoAuthResponse {
  access_token: string;
  expires_in?: number;
}

async function getAccessToken(): Promise<string> {
  const username = process.env.SIIGO_USERNAME;
  const accessKey = process.env.SIIGO_ACCESS_KEY;
  const partnerId = process.env.SIIGO_PARTNER_ID;

  if (!username || !accessKey) {
    throw new SiigoError("Faltan SIIGO_USERNAME / SIIGO_ACCESS_KEY en el entorno");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (partnerId) headers["Partner-Id"] = partnerId;

  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, access_key: accessKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SiigoError(`Error autenticando en Siigo (${res.status}): ${text}`);
  }
  const data = (await res.json()) as SiigoAuthResponse;
  return data.access_token;
}

export async function siigoRequest<T = unknown>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: token,
    "Content-Type": "application/json",
  };
  const partnerId = process.env.SIIGO_PARTNER_ID;
  if (partnerId) headers["Partner-Id"] = partnerId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SiigoError(`Error en ${method} ${path} (${res.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
