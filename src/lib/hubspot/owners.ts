import type { SupabaseClient } from "@supabase/supabase-js";
import { HubspotApiError, hubspotFetchJson } from "@/lib/hubspot/client";
import type { HubspotConnectionSecrets } from "@/lib/hubspot/connections-db";

/**
 * Resuelve el owner de CRM a partir del actor asignado a una conversación
 * (`thread.assignedTo`, formato "A-XXXXXX" o similar) — misma lógica que
 * "quita la A- al ID" en el flujo de n8n: el id numérico después del guion
 * es directamente el id de un owner de HubSpot en este portal. Devuelve
 * `null` si el actor no tiene un owner asociado (ej. un bot, o un formato
 * inesperado) — se trata como "sin propietario", no como error.
 */
export async function resolveOwnerIdFromAssignedActor(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  assignedActorId: string
): Promise<string | null> {
  const numericId = assignedActorId.split("-")[1];
  if (!numericId) return null;

  try {
    const owner = await hubspotFetchJson<{ id: string }>(db, conn, `/crm/v3/owners/${numericId}`);
    return owner.id;
  } catch (err) {
    if (err instanceof HubspotApiError && err.status === 404) return null;
    throw err;
  }
}
