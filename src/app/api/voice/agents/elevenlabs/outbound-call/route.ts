import { NextRequest, NextResponse } from "next/server";
import { billingBlockedMessage, checkBillingForUser } from "@/lib/billing/meter";
import { getElevenLabsApiKey } from "@/lib/elevenlabs/config";
import { resolvePlatformSipConfig } from "@/lib/elevenlabs/sip-config";
import { buildElevenLabsAgentSystemPrompt } from "@/lib/elevenlabs/agent-phone-prompt";
import { placeElevenLabsOutboundCall } from "@/lib/elevenlabs/outbound-call";
import { resolveElevenLabsPhoneLine } from "@/lib/elevenlabs/phone-line";
import { createPhoneTestCallSession } from "@/lib/telephony/test-call-session";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** POST — llamada saliente premium vía ElevenLabs SIP (prueba telefónica). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!getElevenLabsApiKey()) {
    return NextResponse.json(
      { error: "La voz premium no está disponible temporalmente" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { voice_agent_id, phone_number_id, test_number_id } = body as {
    voice_agent_id?: string;
    phone_number_id?: string;
    test_number_id?: string;
  };

  if (!voice_agent_id || !phone_number_id || !test_number_id) {
    return NextResponse.json(
      { error: "voice_agent_id, phone_number_id y test_number_id requeridos" },
      { status: 400 }
    );
  }

  const db = adminClient();
  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      { error: billingBlockedMessage(billing.reason), code: billing.reason },
      { status: 402 }
    );
  }

  const [{ data: phone }, { data: test }, { data: agent }] = await Promise.all([
    db
      .from("phone_numbers")
      .select(
        "id, e164, friendly_name, voice_agent_id, elevenlabs_phone_number_id, elevenlabs_sync_error, elevenlabs_synced_at"
      )
      .eq("id", phone_number_id)
      .eq("user_id", userId)
      .eq("voice_agent_id", voice_agent_id)
      .eq("status", "active")
      .maybeSingle(),
    db
      .from("test_phone_numbers")
      .select("*")
      .eq("id", test_number_id)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("voice_agents")
      .select("id, name, voice_provider, elevenlabs_agent_id")
      .eq("id", voice_agent_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!phone) {
    return NextResponse.json(
      { error: "Línea remitente no asignada a este agente", code: "premium_phone_not_assigned" },
      { status: 400 }
    );
  }
  if (!test) {
    return NextResponse.json({ error: "Número destinatario no encontrado" }, { status: 400 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }
  if (agent.voice_provider !== "elevenlabs") {
    return NextResponse.json({ error: "Este agente no es de voz premium" }, { status: 400 });
  }
  if (!agent.elevenlabs_agent_id) {
    return NextResponse.json(
      { error: "Agente premium sin sincronizar. Guarda la configuración primero." },
      { status: 400 }
    );
  }

  try {
    await resolvePlatformSipConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SIP premium no configurado";
    return NextResponse.json({ error: message, code: "premium_sip_not_configured" }, { status: 503 });
  }

  const line = await resolveElevenLabsPhoneLine(phone, {
    elevenlabsAgentId: agent.elevenlabs_agent_id,
    resync: true,
  });

  if (!line.configured || !line.phoneNumberId) {
    return NextResponse.json(
      {
        error:
          line.syncError ??
          "Línea premium sin sincronizar — asigna la línea en Canales o contacta soporte",
        code: "premium_phone_not_configured",
      },
      { status: 503 }
    );
  }

  if (line.phoneNumberId !== phone.elevenlabs_phone_number_id) {
    await db
      .from("phone_numbers")
      .update({
        elevenlabs_phone_number_id: line.phoneNumberId,
        elevenlabs_sync_error: line.syncError ?? null,
        elevenlabs_synced_at: line.syncedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", phone.id)
      .eq("user_id", userId);
  }

  try {
    const loaded = await loadVoiceAgentForCall(voice_agent_id, userId);
    if (!loaded) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    const systemPromptOverride = buildElevenLabsAgentSystemPrompt({
      prompt: loaded.config.prompt,
      purposeId: loaded.config.source_template,
      agentName: loaded.agentName,
      companyName: loaded.companyName,
      companyContextText: loaded.companyContextText,
    });

    const { conversationId } = await placeElevenLabsOutboundCall({
      agentId: agent.elevenlabs_agent_id,
      toE164: test.e164,
      agentPhoneNumberId: line.phoneNumberId,
      systemPromptOverride,
    });

    const fromE164 = line.e164 ?? phone.e164;

    const callId = await createPhoneTestCallSession({
      userId,
      voiceAgentId: voice_agent_id,
      callControlId: conversationId,
      phoneNumberId: phone_number_id,
      testNumberId: test_number_id,
      from: fromE164,
      to: test.e164,
      agentName: agent.name,
      voiceProvider: "elevenlabs",
    });

    return NextResponse.json({
      success: true,
      call_id: callId,
      call_control_id: conversationId,
      conversation_id: conversationId,
      from: fromE164,
      to: test.e164,
      agent_name: agent.name,
      phase: "dialing",
      provider: "elevenlabs",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al marcar";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
