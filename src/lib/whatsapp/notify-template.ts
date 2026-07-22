import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";

/**
 * Plantilla aprobada de una sola variable, usada para notificaciones al
 * equipo (`notify_team`, derivación a humano) — el mensaje completo ya
 * armado (evento, resumen, contacto, link) va en esa única variable.
 */
export async function getApprovedSingleVarTemplate(
  db: SupabaseClient,
  templateId: string,
  whatsappChannelId: string
): Promise<{ contentSid: string } | null> {
  const { data } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", templateId)
    .eq("whatsapp_channel_id", whatsappChannelId)
    .in("status", ["approved", "active"])
    .maybeSingle();

  if (!data) return null;

  const template = toWhatsAppTemplateRecord(data);
  if (!template.twilio_content_sid) return null;
  if (template.variable_labels.length !== 1) return null;

  return { contentSid: template.twilio_content_sid };
}
