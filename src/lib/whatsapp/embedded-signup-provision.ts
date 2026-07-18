import type { SupabaseClient } from "@supabase/supabase-js";
import { createTwilioSubaccount } from "@/lib/telephony/twilio-subaccounts";
import { resolveEmbeddedSignupPhone } from "@/lib/whatsapp/resolve-embedded-signup-phone";
import {
  configureTwilioWhatsAppSenderWebhook,
  findTwilioSenderByE164,
  linkedWabaIdFromSenders,
  listTwilioWhatsAppSenders,
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
  // 63100: profile.name es obligatorio en la Senders API. Usar verified_name de Meta
  // (no el alias de Noova). Si Graph no lo trae, fallamos con mensaje claro.
  const profileName = resolved.verifiedName?.trim() || "";
  if (!profileName) {
    throw new Error(
      "Meta no devolvió el nombre verificado del negocio (verified_name). Ábrelo en WhatsApp Manager, confirma el nombre aprobado e inténtalo de nuevo."
    );
  }

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

  let subaccount = await ensureTwilioSubaccountForOrg(db, org as OrgRow);

  // Una subcuenta Twilio = un solo WABA. Si ya hay otro WABA, abrimos subcuenta dedicada.
  const existingSenders = await listTwilioWhatsAppSenders({
    accountSid: subaccount.sid,
    authToken: subaccount.authToken
  }).catch(err => {
    console.warn("[whatsapp/provision] list senders:", err);
    return [];
  });

  const already = findTwilioSenderByE164(existingSenders, e164);
  const linkedWaba = linkedWabaIdFromSenders(existingSenders);

  if (!already && linkedWaba && linkedWaba !== wabaId) {
    const dedicated = await createTwilioSubaccount(
      `Noova - ${org.name || org.id.slice(0, 8)} - ${wabaId.slice(-6)}`
    );
    subaccount = { sid: dedicated.sid, authToken: dedicated.authToken, reused: false };
  }

  const existing = await findWhatsAppChannelForProvision(db, input, e164);

  let senderSid: string;
  let senderStatus: string;

  if (already?.sid) {
    const configured = await configureTwilioWhatsAppSenderWebhook({
      e164,
      accountSid: subaccount.sid,
      authToken: subaccount.authToken
    });
    senderSid = configured.senderSid;
    senderStatus = already.status === "ONLINE" ? "ONLINE" : (already.status ?? "CREATING");
  } else {
    try {
      const registered = await registerTwilioWhatsAppSender({
        e164,
        wabaId,
        accountSid: subaccount.sid,
        authToken: subaccount.authToken,
        profileName
      });
      senderSid = registered.senderSid;
      senderStatus = registered.status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists|duplicate|already registered/i.test(message)) {
        const configured = await configureTwilioWhatsAppSenderWebhook({
          e164,
          accountSid: subaccount.sid,
          authToken: subaccount.authToken
        });
        senderSid = configured.senderSid;
        senderStatus = "ONLINE";
      } else if (/63102|already linked to another WABA/i.test(message)) {
        throw new Error(
          "Esta subcuenta Twilio ya está ligada a otra cuenta WhatsApp (WABA). En Noova se creará una subcuenta nueva; vuelve a intentar o contacta soporte."
        );
      } else if (/63110|already registered on WhatsApp/i.test(message)) {
        throw new Error(
          "Ese número sigue registrado en WhatsApp/API de otro proveedor. Libéralo en Meta (o espera la propagación) y vuelve a conectar."
        );
      } else if (/63101|WABA ID provided is not valid/i.test(message)) {
        throw new Error(
          "Twilio no pudo usar ese WABA. Confirma que el Embedded Signup mostró el Partner Solution de Twilio (logos Noova+Twilio) y que META/TWILIO Solution ID está bien en Coolify."
        );
      } else if (/validation error|63100/i.test(message)) {
        throw new Error(
          `Twilio rechazó el registro (63100). Número ${e164}, WABA ${wabaId}, profile="${profileName}". Si el número estaba conectado a otra app (ej. Chatwoot), debes eliminarlo primero desde WhatsApp Manager de Meta. También verifica que el nombre cumpla las guías. Detalle: ${message}`
        );
      } else {
        throw err;
      }
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
