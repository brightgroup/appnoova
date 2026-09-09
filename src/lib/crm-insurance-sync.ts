import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escribe los campos de seguros (placa, vehículo, aseguradora, prima) en
 * `crm_leads.metadata` cuando una `insurance_quote_requests` está ligada a
 * un lead — así el asesor abre la oportunidad y ya tiene todo mapeado, sin
 * ir a buscarlo a la cola de cotizaciones. Los `field_key` coinciden con
 * `INSURANCE_LEAD_PROPERTIES` (src/lib/crm-record.ts). Falla en silencio si
 * el lead no existe — es un efecto secundario, no debe tumbar la cotización.
 */
export async function syncQuoteToLeadMetadata(
  db: SupabaseClient,
  leadId: string | null | undefined,
  fields: Record<string, string | number | boolean | null>
): Promise<void> {
  if (!leadId) return;
  const { data: existing } = await db.from("crm_leads").select("metadata").eq("id", leadId).maybeSingle();
  if (!existing) return;

  const prevMeta = (existing.metadata as Record<string, unknown>) ?? {};
  await db
    .from("crm_leads")
    .update({ metadata: { ...prevMeta, ...fields }, updated_at: new Date().toISOString() })
    .eq("id", leadId);
}
