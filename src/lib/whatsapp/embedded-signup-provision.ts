import type { SupabaseClient } from "@supabase/supabase-js";
import { createTwilioSubaccount } from "@/lib/telephony/twilio-subaccounts";
import { resolveEmbeddedSignupPhone } from "@/lib/whatsapp/resolve-embedded-signup-phone";
import {
  configureTwilioWhatsAppSenderWebhook,
  registerTwilioWhatsAppSender,
  waitForTwilioWhatsAppSenderOnline
} from "@/lib/whatsapp/twilio-senders";

export interface EmbeddedSignupCompleteInput {
  userId: string;
  organizationId: string;
  wabaId: string;
  phoneNumberId?: string | null;
  phoneE164?: string | null;
  displayPhoneNumber?: string | null;
  /** Código OAuth del FB.login — sirve para resolver el número vía Graph si Meta no lo mandó en el postMessage. */
  authCode?: string | null;
  textAgentId?: string | null;
  friendlyName?: string | null;
  /** Reutiliza la misma fila al reconectar una línea desconectada. */
  channelId?: string | null;
}

interface ExistingWhatsAppChannelRow {
  id: string;
  friendly_name: string | null;
  text_agent_id: string | null;
  metadata: Record<string, unknown> | null;
  provider: string;
}

export function buildEmbeddedSignupChannelMetadata(
  priorMeta: Record<string, unknown> | null | undefined,
  extras: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...(priorMeta && typeof priorMeta === "object" ? priorMeta : {}), ...extras };
  delete next.disconnected_at;
  delete next.disconnected_by;
  return next;
}

export async function findWhatsAppChannelForProvision(
  db: SupabaseClient,
  input: EmbeddedSignupCompleteInput,
  e164: string
): Promise<ExistingWhatsAppChannelRow | null> {
  if (input.channelId?.trim()) {
    const { data, error } = await db
      .from("whatsapp_channels")
      .select("id, friendly_name, text_agent_id, metadata, provider")
      .eq("id", input.channelId.trim())
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Línea no encontrada para reconectar");
    }

    return data as ExistingWhatsAppChannelRow;
  }

  const { data: byWaba } = await db
    .from("whatsapp_channels")
    .select("id, friendly_name, text_agent_id, metadata, provider")
    .eq("organization_id", input.organizationId)
    .eq("waba_id", input.wabaId.trim())
    .maybeSingle();

  if (byWaba) return byWaba as ExistingWhatsAppChannelRow;

  const { data: byE164 } = await db
    .from("whatsapp_channels")
    .select("id, friendly_name, text_agent_id, metadata, provider")
    .eq("organization_id", input.organizationId)
    .eq("e164", e164)
    .maybeSingle();

  return byE164 ? (byE164 as ExistingWhatsAppChannelRow) : null;
}

export interface EmbeddedSignupCompleteResult {
  channelId: string;
  e164: string;
  wabaId: string;
  senderSid: string;
  senderStatus: string;
  channelStatus: "active" | "pending";
}

interface OrgRow {
  id: string;
  name: string | null;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_auth_token: string | null;
}

async function ensureTwilioSubaccountForOrg(
  db: SupabaseClient,
  org: OrgRow
): Promise<{ sid: string; authToken: string; reused: boolean }> {
  if (org.twilio_subaccount_sid && org.twilio_subaccount_auth_token) {
    return {
      sid: org.twilio_subaccount_sid,
      authToken: org.twilio_subaccount_auth_token,
      reused: true
    };
  }

  const subName = `Noova - ${org.name || org.id.slice(0, 8)}`;
  const subaccount = await createTwilioSubaccount(subName);

  const { error } = await db
    .from("organizations")
    .update({
      twilio_subaccount_sid: subaccount.sid,
      twilio_subaccount_auth_token: subaccount.authToken,
      updated_at: new Date().toISOString()
    })
    .eq("id", org.id);

  if (error) {
    throw new Error(`Error vinculando subcuenta Twilio: ${error.message}`);
  }

  return { sid: subaccount.sid, authToken: subaccount.authToken, reused: false };
}

/** Aprovisiona canal WhatsApp tras Meta Embedded Signup (Twilio Tech Provider). */
export async function provisionWhatsAppFromEmbeddedSignup(
  db: SupabaseClient,
  input: EmbeddedSignupCompleteInput
): Promise<EmbeddedSignupCompleteResult> {
  const wabaId = input.wabaId.trim();
  if (!wabaId) throw new Error("waba_id requerido");

  const resolved = await resolveEmbeddedSignupPhone(db, input);
  const e164 = resolved.e164;
  const phoneNumberId = resolved.phoneNumberId || input.phoneNumberId || null;

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .select("id, name, twilio_subaccount_sid, twilio_subaccount_auth_token")
    .eq("id", input.organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    throw new Error("Organización no encontrada");
  }

  if (input.textAgentId) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", input.textAgentId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (!agent) {
      throw new Error("Agente de texto no encontrado");
    }
  }

  const subaccount = await ensureTwilioSubaccountForOrg(db, org as OrgRow);

  const existing = await findWhatsAppChannelForProvision(db, input, e164);

  let senderSid: string;
  let senderStatus: string;

  try {
    const registered = await registerTwilioWhatsAppSender({
      e164,
      wabaId,
      accountSid: subaccount.sid,
      authToken: subaccount.authToken,
      profileName: input.friendlyName
    });
    senderSid = registered.senderSid;
    senderStatus = registered.status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|duplicate/i.test(message)) {
      const configured = await configureTwilioWhatsAppSenderWebhook({
        e164,
        accountSid: subaccount.sid,
        authToken: subaccount.authToken
      });
      senderSid = configured.senderSid;
      senderStatus = "ONLINE";
    } else {
      throw err;
    }
  }

  if (senderStatus !== "ONLINE") {
    senderStatus = await waitForTwilioWhatsAppSenderOnline({
      senderSid,
      accountSid: subaccount.sid,
      authToken: subaccount.authToken
    });
  }

  const channelStatus = senderStatus === "ONLINE" ? "active" : "pending";
  const friendlyName =
    input.friendlyName?.trim()
    || existing?.friendly_name?.trim()
    || `WhatsApp ${e164}`;
  const textAgentId = input.textAgentId ?? existing?.text_agent_id ?? null;
  const now = new Date().toISOString();
  const metadata = buildEmbeddedSignupChannelMetadata(existing?.metadata, {
    embedded_signup: true,
    provider: "twilio",
    provisioned_at: now,
    reconnected_at: existing ? now : undefined,
    sender_status: senderStatus,
    subaccount_reused: subaccount.reused,
    phone_resolved_via_graph: !input.phoneE164 && !input.displayPhoneNumber
  });

  if (existing?.id) {
    const { data: updated, error: updateErr } = await db
      .from("whatsapp_channels")
      .update({
        user_id: input.userId,
        text_agent_id: textAgentId,
        e164,
        waba_id: wabaId,
        meta_phone_number_id: phoneNumberId,
        twilio_sender_sid: senderSid,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_auth_token: subaccount.authToken,
        friendly_name: friendlyName,
        status: channelStatus,
        metadata,
        updated_at: now
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updateErr || !updated) {
      throw new Error(updateErr?.message || "Error actualizando canal");
    }

    return {
      channelId: String(updated.id),
      e164,
      wabaId,
      senderSid,
      senderStatus,
      channelStatus
    };
  }

  const { data: created, error: createErr } = await db
    .from("whatsapp_channels")
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId,
      text_agent_id: textAgentId,
      provider: "twilio",
      e164,
      waba_id: wabaId,
      meta_phone_number_id: phoneNumberId,
      twilio_sender_sid: senderSid,
      twilio_subaccount_sid: subaccount.sid,
      twilio_subaccount_auth_token: subaccount.authToken,
      friendly_name: friendlyName,
      status: channelStatus,
      metadata
    })
    .select("id")
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message || "Error creando canal");
  }

  return {
    channelId: String(created.id),
    e164,
    wabaId,
    senderSid,
    senderStatus,
    channelStatus
  };
}
