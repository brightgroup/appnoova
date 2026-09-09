import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
import { ensureDefaultCrmStages } from "@/lib/crm-server";

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

/**
 * Encuentra (o crea) el contacto y el lead de CRM de este cliente por su
 * WhatsApp, para que una cotización de seguros iniciada por IA quede ligada
 * a una oportunidad real desde el primer momento — sin esto, `lead_id` en
 * `insurance_quote_requests` se quedaba siempre null (ninguna de las tools
 * de cotización lo recibía nunca de la conversación real). Solo se llama
 * cuando ya se tienen datos completos del tomador (ver quote-requests-db.ts),
 * nunca antes de eso.
 */
export async function resolveOrCreateInsuranceLead(
  db: SupabaseClient,
  organizationId: string,
  input: { contactE164?: string | null; nombreTomador?: string | null; titulo: string }
): Promise<{ contactId: string; leadId: string } | null> {
  if (!input.contactE164) return null;

  const tenantUserId = await resolveOrgCrmTenantUserId(organizationId, "");
  if (!tenantUserId) return null;

  const whatsapp = normalizeWhatsAppE164(input.contactE164);

  const { data: existingContact } = await db
    .from("crm_contacts")
    .select("id")
    .eq("user_id", tenantUserId)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  let contactId = existingContact?.id as string | undefined;
  if (!contactId) {
    const { data: createdContact } = await db
      .from("crm_contacts")
      .insert({
        user_id: tenantUserId,
        name: input.nombreTomador?.trim() || whatsapp,
        whatsapp,
        phone: whatsapp,
        telefono: whatsapp,
        canal_preferido: "whatsapp",
        fuente_origen: "recepcion_ia"
      })
      .select("id")
      .single();
    contactId = createdContact?.id;
  }
  if (!contactId) return null;

  const { data: existingLead } = await db
    .from("crm_leads")
    .select("id")
    .eq("user_id", tenantUserId)
    .eq("contact_id", contactId)
    .eq("outcome", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId = existingLead?.id as string | undefined;
  if (!leadId) {
    await ensureDefaultCrmStages(db, tenantUserId);
    const { data: firstStage } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("user_id", tenantUserId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!firstStage) return null;

    const { data: createdLead } = await db
      .from("crm_leads")
      .insert({
        user_id: tenantUserId,
        contact_id: contactId,
        stage_id: firstStage.id,
        title: input.titulo,
        outcome: "open",
        source: "whatsapp",
        stage_entered_at: new Date().toISOString()
      })
      .select("id")
      .single();
    leadId = createdLead?.id;
  }
  if (!leadId) return null;

  return { contactId, leadId };
}
