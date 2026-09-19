import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Si la IA debe crear/actualizar contactos y leads del CRM automáticamente desde
 * Mi Link / widget web. Apagado por defecto — el negocio lo prende explícitamente
 * desde Configuración CRM > Automatización cuando lo quiera.
 */
export async function getOrgCrmAutofillEnabled(
  db: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("crm_autofill_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.crm_autofill_enabled === true;
}

export async function setOrgCrmAutofillEnabled(
  db: SupabaseClient,
  organizationId: string,
  enabled: boolean
): Promise<void> {
  await db
    .from("organizations")
    .update({ crm_autofill_enabled: enabled })
    .eq("id", organizationId);
}
