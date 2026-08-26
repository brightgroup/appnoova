import type { SupabaseClient } from "@supabase/supabase-js";
import { HUBSPOT_API_BASE } from "@/lib/hubspot/config";
import { markHubspotConnectionError, type HubspotConnectionSecrets } from "@/lib/hubspot/connections-db";

/**
 * Devuelve un access token utilizable. En modo `private_app` es el token tal
 * cual (no expira, no rota). En modo `oauth` (fase 2, no implementada aún)
 * este es el único punto que ramificaría a un refresh proactivo — mismo
 * patrón que `withFreshAccessToken` en google-calendar/client.ts.
 */
async function getAccessToken(_db: SupabaseClient, conn: HubspotConnectionSecrets): Promise<string> {
  if (conn.authMode === "private_app") return conn.accessToken;
  // TODO(fase 2 OAuth): refresh proactivo con margen de 60s, igual que Google Calendar.
  return conn.accessToken;
}

export class HubspotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HubspotApiError";
  }
}

/** Llamada autenticada genérica a la API de HubSpot. Ante una respuesta no-ok marca la conexión en error y lanza. */
export async function hubspotFetch(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const accessToken = await getAccessToken(db, conn);
  const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `HubSpot API error ${res.status}`;
    try {
      const json = JSON.parse(body) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      // Respuesta no-JSON (ej. HTML de un 502) — se usa el mensaje genérico.
    }
    // 401/403 casi siempre significa token revocado/scopes insuficientes — vale la pena marcar
    // la conexión en error para que la UI avise, distinto de un 404/429 puntual de un solo recurso.
    if (res.status === 401 || res.status === 403) {
      await markHubspotConnectionError(db, conn, message).catch(() => {});
    }
    throw new HubspotApiError(message, res.status);
  }

  return res;
}

/** Como hubspotFetch pero ya parseado como JSON. */
export async function hubspotFetchJson<T>(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await hubspotFetch(db, conn, path, init);
  return (await res.json()) as T;
}
