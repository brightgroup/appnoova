import type { SupabaseClient } from "@supabase/supabase-js";
import { exchangeMetaEmbeddedSignupCode, subscribeMetaAppToWaba } from "@/lib/meta/oauth";
import { resolveEmbeddedSignupPhone } from "@/lib/whatsapp/resolve-embedded-signup-phone";
import type { EmbeddedSignupCompleteInput, EmbeddedSignupCompleteResult } from "@/lib/whatsapp/embedded-signup-provision";
import {
  buildEmbeddedSignupChannelMetadata,
  findWhatsAppChannelForProvision
} from "@/lib/whatsapp/embedded-signup-provision";

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

  const resolved = await resolveEmbeddedSignupPhone(db, input);
  const e164 = resolved.e164;
  const phoneNumberId = resolved.phoneNumberId;

  if (!phoneNumberId) {
    throw new Error("phone_number_id requerido para Cloud API directa");
  }

  // El auth_code solo se canjea una vez. Si resolve ya lo usó, reutilizamos ese token;
  // si Graph no hizo falta, canjeamos aquí para subscribed_apps y guardar el token.
  let accessToken = resolved.accessToken;
  if (!accessToken) {
    const token = await exchangeMetaEmbeddedSignupCode(input.authCode.trim());
    accessToken = token.accessToken;
  }

  await subscribeMetaAppToWaba(wabaId, accessToken).catch(err => {
    console.warn("[whatsapp/meta-provision] subscribed_apps:", err);
  });

  if (input.textAgentId) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", input.textAgentId)
      .eq("organization_id", input.organizationId)
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
