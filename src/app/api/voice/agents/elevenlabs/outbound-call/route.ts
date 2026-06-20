import { NextRequest, NextResponse } from "next/server";
import { billingBlockedMessage, checkBillingForUser } from "@/lib/billing/meter";
import { placeElevenLabsOutboundCall } from "@/lib/elevenlabs/outbound-call";
import { getElevenLabsApiKey, getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";
import { createPhoneTestCallSession } from "@/lib/telephony/test-call-session";
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
  if (!getElevenLabsPhoneNumberId()) {
    return NextResponse.json(
      { error: "La llamada premium no está disponible temporalmente" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { voice_agent_id, test_number_id } = body as {
    voice_agent_id?: string;
    test_number_id?: string;
  };

  if (!voice_agent_id || !test_number_id) {
    return NextResponse.json({ error: "voice_agent_id y test_number_id requeridos" }, { status: 400 });
  }

  const db = adminClient();
  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      { error: billingBlockedMessage(billing.reason), code: billing.reason },
      { status: 402 }
    );
  }

  const [{ data: test }, { data: agent }] = await Promise.all([
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
    return NextResponse.json({ error: "Agente premium sin sincronizar. Guarda la configuración primero." }, { status: 400 });
  }

  try {
    const { conversationId } = await placeElevenLabsOutboundCall({
      agentId: agent.elevenlabs_agent_id,
      toE164: test.e164,
    });

    const callId = await createPhoneTestCallSession({
      userId,
      voiceAgentId: voice_agent_id,
      callControlId: conversationId,
      phoneNumberId: "",
      testNumberId: test_number_id,
      from: "ElevenLabs SIP",
      to: test.e164,
      agentName: agent.name,
      voiceProvider: "elevenlabs",
    });

    return NextResponse.json({
      success: true,
      call_id: callId,
      call_control_id: conversationId,
      conversation_id: conversationId,
      from: "ElevenLabs",
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
