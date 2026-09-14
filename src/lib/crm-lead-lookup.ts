import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";

/**
 * Dado el id de una conversación, encuentra el lead de CRM abierto más
 * reciente ligado a ella — mismo cruce de dos saltos que ya usan
 * crm-lead-enrich.ts y crm-insurance-sync.ts (`crm_leads` nunca guarda el
 * conversation_id directamente salvo cuando la IA lo crea; el salto real es
 * conversación → contacto → lead). Devuelve null sin lanzar si no hay
 * ningún lead todavía — la creación de leads es asíncrona y gateada por IA
 * (crm-auto-enrich.ts), así que "no hay lead aún" es un resultado normal,
 * no un error.
 */
export async function resolveLeadForConversation(
  db: SupabaseClient,
  organizationId: string,
  conversationId: string
): Promise<{ leadId: string; contactId: string } | null> {
  const tenantUserId = await resolveOrgCrmTenantUserId(organizationId, "");
  if (!tenantUserId) return null;

  const { data: contact } = await db
    .from("crm_contacts")
    .select("id")
    .eq("user_id", tenantUserId)
    .eq("inbox_conversation_id", conversationId)
    .maybeSingle();

  if (!contact?.id) return null;

  const { data: lead } = await db
    .from("crm_leads")
    .select("id")
    .eq("user_id", tenantUserId)
    .eq("contact_id", contact.id)
    .eq("outcome", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead?.id) return null;
  return { leadId: lead.id as string, contactId: contact.id as string };
}
