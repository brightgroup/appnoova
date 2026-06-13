import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTwilioTemplateApproval,
  mapTwilioApprovalToNoovaStatus
} from "@/lib/whatsapp/twilio-content";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";

/** Sincroniza plantillas pending_approval con el proveedor (Twilio). */
export async function syncPendingWhatsAppTemplates(
  db: SupabaseClient
): Promise<{ synced: number; approved: number; rejected: number }> {
  const { data: rows, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("status", "pending_approval")
    .not("twilio_content_sid", "is", null);

  if (error || !rows?.length) {
    return { synced: 0, approved: 0, rejected: 0 };
  }

  let synced = 0;
  let approved = 0;
  let rejected = 0;

  for (const row of rows) {
    const tpl = toWhatsAppTemplateRecord(row);
    if (tpl.provider !== "twilio" || !tpl.twilio_content_sid) continue;

    try {
      const approval = await fetchTwilioTemplateApproval(tpl.twilio_content_sid);
      const nextStatus = mapTwilioApprovalToNoovaStatus(approval.status);
      if (nextStatus === "pending_approval") continue;

      const updates: Record<string, unknown> = {
        status: nextStatus,
        updated_at: new Date().toISOString()
      };
      if (nextStatus === "rejected" && approval.rejectionReason) {
        updates.rejection_reason = approval.rejectionReason;
      }

      await db.from("whatsapp_templates").update(updates).eq("id", tpl.id);
      synced++;
      if (nextStatus === "approved") approved++;
      if (nextStatus === "rejected") rejected++;
    } catch {
      // Ignorar errores individuales de sync
    }
  }

  return { synced, approved, rejected };
}
