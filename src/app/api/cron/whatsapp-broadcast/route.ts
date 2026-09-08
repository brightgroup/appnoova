import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp/send-transport";
import { hasSuppression } from "@/lib/crm-contactability";
import { toCrmContact } from "@/lib/crm-record";
import {
  claimPendingRecipients,
  claimRecipient,
  markRecipientFailed,
  markRecipientSkippedOptOut,
  hasNoPendingRecipients,
  updateCampaignStatus
} from "@/lib/campaigns-whatsapp/broadcast-db";

const BATCH_LIMIT = 25;

/**
 * Envía un lote de destinatarios pendientes de campañas en estado 'enviando'.
 * Modelo de un solo proceso (no usa el lock RPC del dialer de voz): reclama
 * marcando 'enviado' antes de llamar a Twilio y baja a 'fallido' si el envío
 * revienta — más simple que un lock, correcto porque este cron corre en un
 * solo proceso a la vez.
 *
 * Auth: header `x-cron-secret` == CRON_SECRET, o superadmin autenticado.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      const auth = await requireSuperAdmin(req);
      if (auth instanceof NextResponse) return auth;
    }
  } else {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  const db = adminClient();
  const claimed = await claimPendingRecipients(db, BATCH_LIMIT);

  const results: { recipient_id: string; ok: boolean; reason?: string }[] = [];
  const touchedCampaignIds = new Set<string>();

  for (const recipient of claimed) {
    touchedCampaignIds.add(recipient.campaign.id);

    if (recipient.contactId) {
      const { data: contactRow } = await db
        .from("crm_contacts")
        .select("*")
        .eq("id", recipient.contactId)
        .maybeSingle();
      if (contactRow && hasSuppression(toCrmContact(contactRow), "no_whatsapp")) {
        await markRecipientSkippedOptOut(db, recipient.id);
        results.push({ recipient_id: recipient.id, ok: false, reason: "omitido_optout" });
        continue;
      }
    }

    const got = await claimRecipient(db, recipient.id);
    if (!got) continue;

    try {
      const { data: channelRow, error: channelErr } = await db
        .from("whatsapp_channels")
        .select("*")
        .eq("id", recipient.campaign.whatsappChannelId)
        .maybeSingle();
      if (channelErr || !channelRow) throw new Error("Canal de WhatsApp no encontrado");
      const channel = toWhatsAppChannelRecord(channelRow);

      const { data: templateRow, error: templateErr } = await db
        .from("whatsapp_templates")
        .select("*")
        .eq("id", recipient.campaign.templateId)
        .maybeSingle();
      if (templateErr || !templateRow) throw new Error("Plantilla no encontrada");
      const template = toWhatsAppTemplateRecord(templateRow);
      if (!template.twilio_content_sid) throw new Error("La plantilla no tiene Content SID de Twilio");

      const contentVariables: Record<string, string> = {};
      template.variable_labels.forEach((label, i) => {
        contentVariables[String(i + 1)] = recipient.variableValues[label] ?? "";
      });

      await sendWhatsAppTemplateMessage({
        channel,
        toE164: recipient.phoneE164,
        contentSid: template.twilio_content_sid,
        contentVariables
      });

      results.push({ recipient_id: recipient.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      await markRecipientFailed(db, recipient.id, message);
      results.push({ recipient_id: recipient.id, ok: false, reason: message });
    }
  }

  for (const campaignId of touchedCampaignIds) {
    if (await hasNoPendingRecipients(db, campaignId)) {
      const campaign = claimed.find(r => r.campaign.id === campaignId)?.campaign;
      if (campaign) await updateCampaignStatus(db, campaign.organizationId, campaignId, "completada");
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function POST(req: NextRequest) {
  return run(req);
}
