import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContentVariables,
  renderTemplatePreview,
  toWhatsAppTemplateRecord
} from "@/lib/whatsapp/template-record";
import { sendTwilioWhatsAppTemplate } from "@/lib/whatsapp/twilio-whatsapp";
import { readWhatsAppMeta } from "@/lib/whatsapp/compliance";
import { WHATSAPP_CONVERSATION_CHANNEL, toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { persistHumanReply } from "@/lib/text-conversation-persist";

export async function sendWhatsAppTemplateForConversation(input: {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  templateId: string;
  variableValues: string[];
  assignedTo: string;
}): Promise<{ ok: boolean; error?: string; code?: string }> {
  const { data: conv, error: convErr } = await input.db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", input.conversationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (convErr || !conv) {
    return { ok: false, error: "Conversación no encontrada" };
  }

  if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
    return { ok: false, error: "Solo disponible para conversaciones WhatsApp" };
  }

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const waMeta = readWhatsAppMeta(meta, normalizeChatMessages(conv.messages));

  if (waMeta.optedOut) {
    return {
      ok: false,
      code: "opted_out",
      error: "Contacto dado de baja. No se pueden enviar plantillas."
    };
  }

  const channelId = meta.whatsapp_channel_id ? String(meta.whatsapp_channel_id) : "";
  const contactE164 = meta.whatsapp_contact_e164 ? String(meta.whatsapp_contact_e164) : "";
  if (!channelId || !contactE164) {
    return { ok: false, error: "Conversación sin metadatos WhatsApp" };
  }

  const { data: templateRow, error: tplErr } = await input.db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", input.templateId)
    .eq("user_id", input.userId)
    .eq("whatsapp_channel_id", channelId)
    .in("status", ["approved", "active"])
    .maybeSingle();

  if (tplErr || !templateRow) {
    return { ok: false, error: "Plantilla no encontrada o inactiva" };
  }

  const template = toWhatsAppTemplateRecord(templateRow);
  if (!template.twilio_content_sid) {
    return { ok: false, error: "Plantilla sin ContentSid del proveedor" };
  }
  if (template.variable_labels.length !== input.variableValues.length) {
    return {
      ok: false,
      error: `Esta plantilla requiere ${template.variable_labels.length} variable(s)`
    };
  }

  const { data: channelRow, error: chErr } = await input.db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (chErr || !channelRow) {
    return { ok: false, error: "Canal WhatsApp no encontrado" };
  }

  const channel = toWhatsAppChannelRecord(channelRow);
  const rendered = renderTemplatePreview(template.body_preview, input.variableValues);
  const contentVariables = buildContentVariables(input.variableValues);

  try {
    await sendTwilioWhatsAppTemplate({
      toE164: contactE164,
      fromE164: channel.e164,
      messagingServiceSid: channel.twilio_messaging_service_sid,
      contentSid: template.twilio_content_sid,
      contentVariables,
      accountSid: channelRow.twilio_subaccount_sid,
      authToken: channelRow.twilio_subaccount_auth_token
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar plantilla";
    return { ok: false, error: msg };
  }

  const label = `[Plantilla: ${template.template_name}] ${rendered}`;
  const persist = await persistHumanReply({
    db: input.db,
    userId: input.userId,
    conversationId: input.conversationId,
    content: label,
    assignedTo: input.assignedTo
  });

  if (!persist.ok) {
    return { ok: false, error: persist.error ?? "Plantilla enviada pero no se guardó en Inbox" };
  }

  return { ok: true };
}
