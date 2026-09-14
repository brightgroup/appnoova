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

/**
 * Un 403 "acotado": HubSpot lo devuelve cuando el actor puntual de la llamada (ej. el usuario
 * configurado como remitente en `action.hubspot_send_message`) no tiene acceso a un recurso
 * puntual (una bandeja/hilo concreto) — NO significa que el token de la Private App esté mal.
 * Pasó exactamente esto con Newbody: le quitaron a un usuario el acceso a una sola bandeja (de
 * las ~20 que escucha el trigger) y eso marcó TODA la conexión de la organización en error,
 * cortando la creación de contactos y el saludo para las otras 19 bandejas también. La API de
 * Conversations no manda un `category` distinto para este caso, así que se detecta por texto.
 */
function isScopedPermissionError(message: string): boolean {
  return /does not have access to (the )?(inbox|conversation|thread)/i.test(message);
}

/** Llamada autenticada genérica a la API de HubSpot. Ante una respuesta no-ok marca la conexión en error y lanza —
 * salvo que sea un 403 acotado a un actor/recurso puntual (ver `isScopedPermissionError`), donde solo se lanza
 * para que el paso puntual falle y quede en el log de Ejecuciones, sin apagar el resto de la organización. */
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
    // 401 siempre, y 403 casi siempre, significa token revocado/scopes insuficientes del propio
    // Private App — vale la pena marcar la conexión en error para que la UI avise, distinto de un
    // 404/429 puntual de un solo recurso. La excepción es el 403 "acotado" (ver
    // `isScopedPermissionError`): ese es un problema de permisos de un actor sobre un recurso
    // puntual, no del token, y no debe tumbar la conexión completa de la organización.
    if (res.status === 401 || (res.status === 403 && !isScopedPermissionError(message))) {
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
