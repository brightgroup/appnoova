import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendTwilioWhatsAppMessage,
  sendTwilioWhatsAppTemplate,
  sendTwilioTypingIndicator
} from "@/lib/whatsapp/twilio-whatsapp";
import { createTwilioQuickReplyContent, createTwilioListPickerContent } from "@/lib/whatsapp/twilio-content";
import { savePendingInteractiveOptions } from "@/lib/whatsapp/interactive-reply-resolve";
import {
  isMetaWhatsAppChannel,
  readMetaAccessToken,
  sendMetaWhatsAppTextMessage,
  sendMetaWhatsAppMediaMessage,
  sendMetaWhatsAppTypingIndicator,
  sendMetaWhatsAppInteractiveMessage
} from "@/lib/whatsapp/meta-whatsapp";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export interface SendWhatsAppTextInput {
  channel: WhatsAppChannelRecord;
  channelRaw?: Record<string, unknown>;
  toE164: string;
  body: string;
  db?: SupabaseClient;
}

async function resolveMetaToken(
  channel: WhatsAppChannelRecord,
  channelRaw: Record<string, unknown> | undefined,
  db: SupabaseClient | undefined
): Promise<string | null> {
  const fromRaw = channelRaw ? readMetaAccessToken(channelRaw) : null;
  if (fromRaw) return fromRaw;
  if (!db || channel.provider !== "meta") return null;

  const { data } = await db
    .from("whatsapp_channels")
    .select("meta_access_token")
    .eq("id", channel.id)
    .maybeSingle();

  return data?.meta_access_token ? String(data.meta_access_token) : null;
}

/** Envía texto por Twilio o Meta según provider del canal. */
export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput): Promise<{ externalId?: string }> {
  const { channel, toE164, body } = input;
  const metaToken = await resolveMetaToken(channel, input.channelRaw, input.db);

  if (isMetaWhatsAppChannel({ ...channel, meta_access_token: metaToken })) {
    const result = await sendMetaWhatsAppTextMessage({
      phoneNumberId: channel.meta_phone_number_id!,
      accessToken: metaToken!,
      toE164,
      body
    });
    return { externalId: result.messageId };
  }

  const twilio = await sendTwilioWhatsAppMessage({
    toE164,
    fromE164: channel.e164,
    messagingServiceSid: channel.twilio_messaging_service_sid,
    body,
    accountSid: channel.twilio_subaccount_sid,
    authToken: channel.twilio_subaccount_auth_token
  });

  return { externalId: twilio.sid };
}

export interface SendWhatsAppMediaInput {
  channel: WhatsAppChannelRecord;
  channelRaw?: Record<string, unknown>;
  toE164: string;
  mediaUrl: string;
  mediaType: "image" | "document";
  caption?: string;
  filename?: string;
  db?: SupabaseClient;
}

/** Envía imagen o documento (por URL) por Twilio o Meta según provider del canal. */
export async function sendWhatsAppMediaMessage(input: SendWhatsAppMediaInput): Promise<{ externalId?: string }> {
  const { channel, toE164, mediaUrl, mediaType, caption, filename } = input;
  const metaToken = await resolveMetaToken(channel, input.channelRaw, input.db);

  if (isMetaWhatsAppChannel({ ...channel, meta_access_token: metaToken })) {
    const result = await sendMetaWhatsAppMediaMessage({
      phoneNumberId: channel.meta_phone_number_id!,
      accessToken: metaToken!,
      toE164,
      mediaUrl,
      mediaType,
      caption,
      filename
    });
    return { externalId: result.messageId };
  }

  const twilio = await sendTwilioWhatsAppMessage({
    toE164,
    fromE164: channel.e164,
    messagingServiceSid: channel.twilio_messaging_service_sid,
    body: caption ?? "",
    mediaUrls: [mediaUrl],
    accountSid: channel.twilio_subaccount_sid,
    authToken: channel.twilio_subaccount_auth_token
  });

  return { externalId: twilio.sid };
}

export interface SendWhatsAppInteractiveInput {
  channel: WhatsAppChannelRecord;
  channelRaw?: Record<string, unknown>;
  toE164: string;
  body: string;
  buttons?: { id: string; title: string }[];
  listSections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  listButtonLabel?: string;
  db?: SupabaseClient;
}

/**
 * Botones o lista de opciones. **Twilio es el proveedor real de casi todos
 * los canales de Noova** (Meta Embedded Signup es solo la pantalla de
 * onboarding — el canal resultante siempre queda `provider: "twilio"", ver
 * embedded-signup-provision.ts) — por eso este camino tiene que funcionar de
 * verdad en Twilio, no solo en Meta directo.
 *
 * Twilio exige un paso extra que Meta no pide: crear primero un recurso
 * Content (`twilio/quick-reply` o `twilio/list-picker`) vía su Content API,
 * y luego enviarlo referenciando ese SID — dos llamadas en vez de una. Como
 * el contenido lo genera la IA y cambia en cada envío, se crea un Content
 * nuevo por mensaje (no se reutiliza uno fijo). Dentro de la ventana de 24h
 * de servicio al cliente esto NO requiere aprobación de plantilla.
 */
export async function sendWhatsAppInteractiveMessage(
  input: SendWhatsAppInteractiveInput
): Promise<{ externalId?: string }> {
  const { channel, toE164, body, buttons, listSections, listButtonLabel } = input;
  const metaToken = await resolveMetaToken(channel, input.channelRaw, input.db);

  if (isMetaWhatsAppChannel({ ...channel, meta_access_token: metaToken })) {
    const result = await sendMetaWhatsAppInteractiveMessage({
      phoneNumberId: channel.meta_phone_number_id!,
      accessToken: metaToken!,
      toE164,
      body,
      buttons,
      listSections,
      listButtonLabel
    });
    return { externalId: result.messageId };
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (buttons?.length) {
    const content = await createTwilioQuickReplyContent({
      friendlyName: `noova-quickreply-${uniqueSuffix}`,
      language: "es",
      body,
      actions: buttons.map(b => ({ id: b.id, title: b.title.slice(0, 20) }))
    });
    const twilio = await sendTwilioWhatsAppTemplate({
      toE164,
      fromE164: channel.e164,
      messagingServiceSid: channel.twilio_messaging_service_sid,
      contentSid: content.sid,
      accountSid: channel.twilio_subaccount_sid,
      authToken: channel.twilio_subaccount_auth_token
    });
    if (input.db) {
      await savePendingInteractiveOptions(
        input.db,
        channel.id,
        toE164,
        Object.fromEntries(buttons.map(b => [b.id, b.title]))
      );
    }
    return { externalId: twilio.sid };
  }

  if (listSections?.length) {
    const items = listSections.flatMap(s => s.rows).slice(0, 10);
    const content = await createTwilioListPickerContent({
      friendlyName: `noova-listpicker-${uniqueSuffix}`,
      language: "es",
      body,
      button: (listButtonLabel ?? "Ver opciones").slice(0, 20),
      items: items.map(r => ({ id: r.id, item: r.title.slice(0, 24), description: r.description?.slice(0, 72) }))
    });
    const twilio = await sendTwilioWhatsAppTemplate({
      toE164,
      fromE164: channel.e164,
      messagingServiceSid: channel.twilio_messaging_service_sid,
      contentSid: content.sid,
      accountSid: channel.twilio_subaccount_sid,
      authToken: channel.twilio_subaccount_auth_token
    });
    if (input.db) {
      await savePendingInteractiveOptions(
        input.db,
        channel.id,
        toE164,
        Object.fromEntries(items.map(r => [r.id, r.title]))
      );
    }
    return { externalId: twilio.sid };
  }

  throw new Error("Falta pasar buttons o listSections");
}

export function whatsAppProviderForBilling(channel: WhatsAppChannelRecord): "twilio" | "meta" {
  return channel.provider === "meta" ? "meta" : "twilio";
}

export interface SendWhatsAppTypingIndicatorInput {
  channel: WhatsAppChannelRecord;
  channelRaw?: Record<string, unknown>;
  /** SID de Twilio (SM…/MM…) o wamid de Meta del mensaje entrante al que se responde. */
  messageId: string;
  db?: SupabaseClient;
}

/**
 * Indicador nativo de "escribiendo…" de WhatsApp mientras el agente genera
 * la respuesta. Se desvanece solo (respuesta entregada o ~25s). Quien llama
 * debe tratarlo como best-effort (no bloquear ni fallar el envío si esto falla).
 */
export async function sendWhatsAppTypingIndicator(input: SendWhatsAppTypingIndicatorInput): Promise<void> {
  const { channel, messageId } = input;
  const metaToken = await resolveMetaToken(channel, input.channelRaw, input.db);

  if (isMetaWhatsAppChannel({ ...channel, meta_access_token: metaToken })) {
    await sendMetaWhatsAppTypingIndicator({
      phoneNumberId: channel.meta_phone_number_id!,
      accessToken: metaToken!,
      messageId
    });
    return;
  }

  await sendTwilioTypingIndicator({
    messageSid: messageId,
    accountSid: channel.twilio_subaccount_sid,
    authToken: channel.twilio_subaccount_auth_token
  });
}

export interface SendWhatsAppTemplateNotifyInput {
  channel: WhatsAppChannelRecord;
  toE164: string;
  contentSid: string;
  contentVariables: Record<string, string>;
}

/**
 * Envía una plantilla ya aprobada por Meta (fuera de la ventana de 24h, sin
 * riesgo de que Twilio/Meta la marque como spam) — usado para notificar al
 * equipo (`notify_team`, derivación a humano), no para responder al cliente.
 * Solo Twilio por ahora (proveedor recomendado); Meta directo queda pendiente.
 */
export async function sendWhatsAppTemplateMessage(
  input: SendWhatsAppTemplateNotifyInput
): Promise<{ externalId?: string }> {
  if (input.channel.provider === "meta") {
    throw new Error("Notificación por plantilla WhatsApp aún no soportada con proveedor Meta directo");
  }

  const twilio = await sendTwilioWhatsAppTemplate({
    toE164: input.toE164,
    fromE164: input.channel.e164,
    messagingServiceSid: input.channel.twilio_messaging_service_sid,
    contentSid: input.contentSid,
    contentVariables: input.contentVariables,
    accountSid: input.channel.twilio_subaccount_sid,
    authToken: input.channel.twilio_subaccount_auth_token
  });

  return { externalId: twilio.sid };
}
