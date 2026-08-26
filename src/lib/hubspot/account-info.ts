import { HUBSPOT_API_BASE } from "@/lib/hubspot/config";

export interface HubspotAccountInfo {
  portalId: string | null;
}

/**
 * Valida un Private App Token llamando directo a la API (sin pasar por
 * `hubspotFetch`, que requiere una conexión ya guardada en BD — este se usa
 * justo antes de guardarla, para confirmar que el token sirve y capturar el
 * portalId). Lanza si el token es inválido.
 */
export async function fetchHubspotAccountInfo(accessToken: string): Promise<HubspotAccountInfo> {
  const res = await fetch(`${HUBSPOT_API_BASE}/account-info/v3/details`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("El token no es válido o no tiene los scopes necesarios (contactos + conversaciones).");
    }
    throw new Error(`HubSpot no respondió como se esperaba (HTTP ${res.status}).`);
  }

  const json = (await res.json().catch(() => ({}))) as { portalId?: number };
  return { portalId: json.portalId != null ? String(json.portalId) : null };
}
