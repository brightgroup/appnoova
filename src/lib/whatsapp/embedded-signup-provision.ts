import type { SupabaseClient } from "@supabase/supabase-js";
import { createTwilioSubaccount } from "@/lib/telephony/twilio-subaccounts";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";
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
  textAgentId?: string | null;
  friendlyName?: string | null;
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

function resolvePhoneE164(input: EmbeddedSignupCompleteInput): string {
  const candidates = [input.phoneE164, input.displayPhoneNumber];
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const normalized = normalizeWhatsAppE164(raw);
    if (normalized.length > 4) return normalized;
  }
  throw new Error(
    "No se recibió el número de teléfono. Completa el flujo de Meta o indica el número en formato E.164."
  );
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

  const e164 = resolvePhoneE164(input);

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
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!agent) {
      throw new Error("Agente de texto no encontrado");
    }
  }

  const subaccount = await ensureTwilioSubaccountForOrg(db, org as OrgRow);

  const { data: byWaba } = await db
    .from("whatsapp_channels")
    .select("id, e164, waba_id")
    .eq("organization_id", input.organizationId)
    .eq("waba_id", wabaId)
    .maybeSingle();

  const { data: byE164 } = byWaba
    ? { data: null }
    : await db
        .from("whatsapp_channels")
        .select("id, e164, waba_id")
        .eq("organization_id", input.organizationId)
        .eq("e164", e164)
        .maybeSingle();

  const existing = byWaba ?? byE164;

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
  const friendlyName = input.friendlyName?.trim() || `WhatsApp ${e164}`;
  const now = new Date().toISOString();
  const metadata = {
    embedded_signup: true,
    provisioned_at: now,
    sender_status: senderStatus,
    subaccount_reused: subaccount.reused
  };

  if (existing?.id) {
    const { data: updated, error: updateErr } = await db
      .from("whatsapp_channels")
      .update({
        user_id: input.userId,
        text_agent_id: input.textAgentId || null,
        e164,
        waba_id: wabaId,
        meta_phone_number_id: input.phoneNumberId || null,
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
      text_agent_id: input.textAgentId || null,
      provider: "twilio",
      e164,
      waba_id: wabaId,
      meta_phone_number_id: input.phoneNumberId || null,
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
