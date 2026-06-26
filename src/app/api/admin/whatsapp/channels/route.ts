import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { normalizeWhatsAppE164, toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";
import { isTwilioWhatsAppConfigured } from "@/lib/whatsapp/twilio-whatsapp";
import { configureTwilioWhatsAppSenderWebhook } from "@/lib/whatsapp/twilio-senders";
import { resolveOrgIdForUser } from "@/lib/billing/meter";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ channels: [], dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    channels: (data ?? []).map(row => toWhatsAppChannelRecord(row)),
    webhook_url: twilioWhatsAppWebhookUrl(),
    twilio_configured: isTwilioWhatsAppConfigured(),
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const userId = String(body.user_id ?? "").trim();
  const e164 = normalizeWhatsAppE164(String(body.e164 ?? ""));
  const textAgentId = body.text_agent_id ? String(body.text_agent_id) : null;
  const friendlyName = body.friendly_name ? String(body.friendly_name).trim() : null;
  const messagingServiceSid = body.twilio_messaging_service_sid
    ? String(body.twilio_messaging_service_sid).trim()
    : null;
  const wabaId = body.waba_id ? String(body.waba_id).trim() : null;
  const status = body.status === "active" ? "active" : "pending";

  if (!userId || !e164) {
    return NextResponse.json({ error: "user_id y e164 son requeridos" }, { status: 400 });
  }

  const db = adminClient();
  const organizationId = await resolveOrgIdForUser(db, userId);

  if (textAgentId) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", textAgentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agente de texto no pertenece a la organización del usuario" }, { status: 400 });
    }
  }

  const { data, error } = await db
    .from("whatsapp_channels")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      text_agent_id: textAgentId,
      e164,
      friendly_name: friendlyName ?? `WhatsApp ${e164}`,
      twilio_messaging_service_sid: messagingServiceSid,
      waba_id: wabaId,
      status,
      provider: "twilio"
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta 021_whatsapp_channels.sql" }, { status: 503 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ese número WhatsApp ya está registrado" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel: toWhatsAppChannelRecord(data) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const channelId = String(body.id ?? "");
  if (!channelId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (body.status !== undefined) {
    const s = String(body.status);
    if (s === "active" || s === "pending" || s === "suspended") {
      updates.status = s;
    }
  }
  if (body.text_agent_id !== undefined) updates.text_agent_id = body.text_agent_id || null;
  if (body.friendly_name !== undefined) updates.friendly_name = body.friendly_name || null;

  const { data: before } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
  }

  const { data, error } = await db
    .from("whatsapp_channels")
    .update(updates)
    .eq("id", channelId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
  }

  const activating =
    updates.status === "active" && String(before.status) !== "active";
  const subSid = String(data.twilio_subaccount_sid ?? "").trim();
  const subToken = String(data.twilio_subaccount_auth_token ?? "").trim();

  if (activating && subSid && subToken) {
    try {
      const webhook = await configureTwilioWhatsAppSenderWebhook({
        e164: String(data.e164),
        accountSid: subSid,
        authToken: subToken
      });
      return NextResponse.json({
        channel: toWhatsAppChannelRecord(data),
        webhook_configured: webhook
      });
    } catch (err) {
      console.error("[admin/whatsapp] webhook configure:", err);
      return NextResponse.json({
        channel: toWhatsAppChannelRecord(data),
        webhook_error:
          err instanceof Error ? err.message : "No se pudo configurar webhook en Twilio"
      });
    }
  }

  return NextResponse.json({ channel: toWhatsAppChannelRecord(data) });
}
