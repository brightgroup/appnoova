import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrganizationBillingProfile {
  organization_id: string;
  tipo_persona: "natural" | "juridica";
  tipo_documento: "CC" | "NIT" | "CE" | "PA";
  numero_documento: string;
  digito_verificacion: string | null;
  razon_social: string;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  email_facturacion: string | null;
  siigo_customer_id: string | null;
}

/** Campos sin los que no se puede facturar (fiscalmente) a la organización. */
export function isBillingProfileComplete(
  profile: Partial<OrganizationBillingProfile> | null | undefined
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.tipo_persona &&
      profile.tipo_documento &&
      profile.numero_documento?.trim() &&
      profile.razon_social?.trim()
  );
}

/** Trae el perfil fiscal de una org (o null si no ha llenado nada) desde el server. */
export async function fetchBillingProfile(
  db: SupabaseClient,
  organizationId: string
): Promise<OrganizationBillingProfile | null> {
  const { data } = await db
    .from("organization_billing_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as OrganizationBillingProfile | null) ?? null;
}
