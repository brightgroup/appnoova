import type { SupabaseClient } from "@supabase/supabase-js";
import { hubspotFetchJson } from "@/lib/hubspot/client";
import type { HubspotConnectionSecrets } from "@/lib/hubspot/connections-db";

export interface HubspotContact {
  id: string;
  properties: Record<string, string | null>;
}

/**
 * Busca un contacto por su teléfono de WhatsApp — `hs_whatsapp_phone_number`
 * es la propiedad estándar que HubSpot usa para el canal nativo de WhatsApp,
 * no es específica de ningún cliente, así que sirve igual para cualquier
 * organización que use este nodo.
 */
export async function searchContactByPhone(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  phone: string
): Promise<HubspotContact | null> {
  const json = await hubspotFetchJson<{ total: number; results: HubspotContact[] }>(
    db,
    conn,
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "hs_whatsapp_phone_number", operator: "EQ", value: phone }] }
        ],
        limit: 1
      })
    }
  );
  return json.results?.[0] ?? null;
}

export interface CreateContactInput {
  phone: string;
  fullName: string | null;
  /** Dominio para el email placeholder que exige HubSpot cuando no hay email real — configurable en el nodo. */
  placeholderEmailDomain: string;
}

/** Crea un contacto nuevo a partir de los datos del remitente de WhatsApp — equivale a "Create or update a contact" en n8n. */
export async function createContact(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  input: CreateContactInput
): Promise<HubspotContact> {
  return hubspotFetchJson<HubspotContact>(db, conn, "/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        email: `${input.phone}@${input.placeholderEmailDomain}`,
        firstname: input.fullName || undefined,
        hs_whatsapp_phone_number: input.phone
      }
    })
  });
}
