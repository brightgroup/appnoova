/**
 * Configuración del conector HubSpot. A diferencia de Google Calendar, el
 * modo `private_app` (fase 1) no depende de ninguna app registrada por
 * Noova — cada organización pega el token de su propia Private App, así que
 * no hay "configured" a nivel de servidor para ese modo. `isHubspotOAuthConfigured`
 * queda listo para cuando exista una app pública de Noova en el marketplace
 * de HubSpot (fase 2) — ver plan de migración.
 */

export const HUBSPOT_API_BASE = "https://api.hubapi.com";

export function getHubspotOAuthClientId(): string | null {
  return process.env.HUBSPOT_OAUTH_CLIENT_ID?.trim() || null;
}

export function getHubspotOAuthClientSecret(): string | null {
  return process.env.HUBSPOT_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function isHubspotOAuthConfigured(): boolean {
  return Boolean(getHubspotOAuthClientId() && getHubspotOAuthClientSecret());
}

/** Scopes que pediría la app OAuth de Noova (fase 2) — hoy documentan lo que el cliente debe marcar a mano al crear su Private App. */
export const HUBSPOT_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.owners.read",
  "conversations.read",
  "conversations.write"
];
