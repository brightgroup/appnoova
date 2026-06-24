import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exchangeMetaEmbeddedSignupCode,
  fetchMetaPhoneNumberDetails,
  fetchMetaWabaPhoneNumbers,
  subscribeMetaAppToWaba
} from "@/lib/meta/oauth";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";
import type { EmbeddedSignupCompleteInput, EmbeddedSignupCompleteResult } from "@/lib/whatsapp/embedded-signup-provision";
import {
  buildEmbeddedSignupChannelMetadata,
  findWhatsAppChannelForProvision
} from "@/lib/whatsapp/embedded-signup-provision";

function normalizePhoneCandidate(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const normalized = normalizeWhatsAppE164(raw);
  return normalized.length > 4 ? normalized : "";
}

async function resolveMetaEmbeddedSignupPhone(
  db: SupabaseClient,
  input: EmbeddedSignupCompleteInput & { displayPhoneNumber?: string | null },
  accessToken: string,
  wabaId: string
): Promise<{ e164: string; phoneNumberId: string }> {
  let phoneNumberId = input.phoneNumberId?.trim() || "";
  let e164 = normalizePhoneCandidate(input.phoneE164) || normalizePhoneCandidate(input.displayPhoneNumber);

  if (!e164 && phoneNumberId) {
    try {
      const details = await fetchMetaPhoneNumberDetails(phoneNumberId, accessToken);
      e164 = details.e164;
    } catch (err) {
      console.warn("[whatsapp/meta-provision] phone fetch by id:", err);
    }
  }

  if (!e164 || !phoneNumberId) {
    try {
      const phones = await fetchMetaWabaPhoneNumbers(wabaId, accessToken);
      if (phoneNumberId) {
        const match = phones.find(phone => phone.id === phoneNumberId);
        if (match) e164 = match.e164;
      } else if (phones.length === 1) {
        phoneNumberId = phones[0].id;
        e164 = phones[0].e164;
      } else if (phones.length > 1 && e164) {
        const match = phones.find(phone => phone.e164 === e164);
        if (match) phoneNumberId = match.id;
      }
    } catch (err) {
      console.warn("[whatsapp/meta-provision] WABA phone_numbers:", err);
    }
  }

  if (!e164 && input.channelId?.trim()) {
    const { data: channel } = await db
      .from("whatsapp_channels")
      .select("e164, meta_phone_number_id")
      .eq("id", input.channelId.trim())
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    e164 = normalizePhoneCandidate(channel?.e164 ? String(channel.e164) : null);
    if (!phoneNumberId && channel?.meta_phone_number_id) {
      phoneNumberId = String(channel.meta_phone_number_id).trim();
    }
  }

  if (!e164) {
    throw new Error("Falta número de teléfono para vincular WhatsApp directo con Meta");
  }

  if (!phoneNumberId) {
    throw new Error("phone_number_id requerido para Cloud API directa");
  }

  return { e164, phoneNumberId };
}

/** Aprovisiona canal WhatsApp directo (Cloud API) tras Embedded Signup — sin Twilio. */
export async function provisionWhatsAppFromEmbeddedSignupMeta(
  db: SupabaseClient,
  input: EmbeddedSignupCompleteInput & {
    authCode?: string | null;
    displayPhoneNumber?: string | null;
  }
): Promise<EmbeddedSignupCompleteResult> {
  const wabaId = input.wabaId.trim();
  if (!wabaId) throw new Error("waba_id requerido");

  if (!input.authCode?.trim()) {
    throw new Error("auth_code requerido para vinculación directa Meta (código OAuth del flujo Embedded Signup)");
  }

  const { accessToken } = await exchangeMetaEmbeddedSignupCode(input.authCode.trim());

  const { e164, phoneNumberId } = await resolveMetaEmbeddedSignupPhone(db, input, accessToken, wabaId);

  await subscribeMetaAppToWaba(wabaId, accessToken).catch(err => {
    console.warn("[whatsapp/meta-provision] subscribed_apps:", err);
  });

  if (input.textAgentId) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", input.textAgentId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!agent) throw new Error("Agente de texto no encontrado");
  }

  const existing = await findWhatsAppChannelForProvision(db, input, e164);
  const friendlyName =
    input.friendlyName?.trim()
    || existing?.friendly_name?.trim()
    || `WhatsApp ${e164}`;
  const textAgentId = input.textAgentId ?? existing?.text_agent_id ?? null;
  const now = new Date().toISOString();
  const metadata = buildEmbeddedSignupChannelMetadata(existing?.metadata, {
    embedded_signup: true,
    provider: "meta",
    provisioned_at: now,
    reconnected_at: existing ? now : undefined
  });

  const row = {
    user_id: input.userId,
    organization_id: input.organizationId,
    text_agent_id: textAgentId,
    provider: "meta",
    e164,
    waba_id: wabaId,
    meta_phone_number_id: phoneNumberId,
    meta_access_token: accessToken,
    friendly_name: friendlyName,
    status: "active" as const,
    metadata,
    updated_at: now
  };

  if (existing?.id) {
    const { data: updated, error } = await db
      .from("whatsapp_channels")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !updated) throw new Error(error?.message || "Error actualizando canal Meta");
    return {
      channelId: String(updated.id),
      e164,
      wabaId,
      senderSid: phoneNumberId,
      senderStatus: "ONLINE",
      channelStatus: "active"
    };
  }

  const { data: created, error } = await db
    .from("whatsapp_channels")
    .insert(row)
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message || "Error creando canal Meta");

  return {
    channelId: String(created.id),
    e164,
    wabaId,
    senderSid: phoneNumberId,
    senderStatus: "ONLINE",
    channelStatus: "active"
  };
}

export function isMetaDirectWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_DEFAULT_PROVIDER?.trim().toLowerCase() === "meta";
}
