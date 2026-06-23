import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exchangeMetaEmbeddedSignupCode,
  fetchMetaPhoneNumberDetails,
  subscribeMetaAppToWaba
} from "@/lib/meta/oauth";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";
import type { EmbeddedSignupCompleteInput, EmbeddedSignupCompleteResult } from "@/lib/whatsapp/embedded-signup-provision";

function resolvePhoneE164(input: EmbeddedSignupCompleteInput & {
  displayPhoneNumber?: string | null;
}): string {
  const candidates = [input.phoneE164, input.displayPhoneNumber];
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const normalized = normalizeWhatsAppE164(raw);
    if (normalized.length > 4) return normalized;
  }
  throw new Error("Falta número de teléfono para vincular WhatsApp directo con Meta");
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

  let e164 = resolvePhoneE164(input);
  let phoneNumberId = input.phoneNumberId?.trim() || null;

  if (phoneNumberId) {
    try {
      const details = await fetchMetaPhoneNumberDetails(phoneNumberId, accessToken);
      e164 = details.e164;
    } catch (err) {
      console.warn("[whatsapp/meta-provision] phone fetch fallback:", err);
    }
  }

  if (!phoneNumberId) {
    throw new Error("phone_number_id requerido para Cloud API directa");
  }

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

  const { data: byWaba } = await db
    .from("whatsapp_channels")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("waba_id", wabaId)
    .maybeSingle();

  const { data: byE164 } = byWaba
    ? { data: null }
    : await db
        .from("whatsapp_channels")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("e164", e164)
        .maybeSingle();

  const existingId = byWaba?.id ?? byE164?.id;
  const friendlyName = input.friendlyName?.trim() || `WhatsApp ${e164}`;
  const now = new Date().toISOString();
  const metadata = {
    embedded_signup: true,
    provider: "meta",
    provisioned_at: now
  };

  const row = {
    user_id: input.userId,
    organization_id: input.organizationId,
    text_agent_id: input.textAgentId || null,
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

  if (existingId) {
    const { data: updated, error } = await db
      .from("whatsapp_channels")
      .update(row)
      .eq("id", existingId)
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
