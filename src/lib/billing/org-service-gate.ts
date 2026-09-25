import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgServiceBlockReason = "suspended" | "disabled";

/**
 * ¿La organización puede recibir servicio? — equivalente, para los caminos
 * SIN sesión (webhooks públicos de HubSpot/WhatsApp/WooCommerce, crons,
 * chat público), del bloqueo 402 que `getOrgContextFromRequest` ya aplica a
 * la API con sesión. Lee `organizations.status`, el mismo campo que actualizan
 * billing_run_renewals, los webhooks de pago y "Desactivar" del superadmin.
 *
 * Devuelve la razón del bloqueo, o `null` si la org puede operar. Ante un
 * error de lectura no bloquea (mismo criterio que checkBillingForOrg): un
 * fallo transitorio de la DB no debe tumbar el servicio de todos los clientes.
 */
export async function getOrgServiceBlock(
  db: SupabaseClient,
  organizationId: string | null | undefined
): Promise<OrgServiceBlockReason | null> {
  if (!organizationId) return null;
  const { data, error } = await db
    .from("organizations")
    .select("status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.status === "suspended" || data.status === "disabled") return data.status;
  return null;
}
