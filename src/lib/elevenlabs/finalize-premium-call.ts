import { adminClient } from "@/lib/voice-agents-server";
import { chargeVoiceCall, resolveOrgIdForUser } from "@/lib/billing/meter";
import { getElevenLabsConversation } from "@/lib/elevenlabs/outbound-call";
import { buildCallRecordFields, splitCallRecordFields, updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import { getPhoneTestCallSession, updatePhoneTestCallSession } from "@/lib/telephony/test-call-session";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export async function finalizeElevenLabsPremiumCall(input: {
  conversationId: string;
  durationSec?: number;
  transcript?: TranscriptEntry[];
  disconnectReason?: string;
}): Promise<void> {
  const session = await getPhoneTestCallSession(input.conversationId);
  if (!session) {
    console.warn("[elevenlabs-finalize] sesión no encontrada", input.conversationId);
    return;
  }

  const meta = session.metadata;
  if (meta.finalized) return;

  const agent = await loadVoiceAgentForCall(session.voice_agent_id, session.user_id);
  if (!agent) {
    console.error("[elevenlabs-finalize] agente no encontrado", session.voice_agent_id);
    return;
  }

  let durationSec = input.durationSec ?? 0;
  let transcript = input.transcript ?? [];

  if (durationSec <= 0 || transcript.length === 0) {
    try {
      const conv = await getElevenLabsConversation(input.conversationId);
      if (durationSec <= 0) durationSec = conv.callDurationSecs;
      if (transcript.length === 0) transcript = conv.transcript;
    } catch (err) {
      console.warn("[elevenlabs-finalize] no se pudo leer conversación:", err);
    }
  }

  const answeredAt = meta.answered_at ? new Date(meta.answered_at).getTime() : null;
  if (durationSec <= 0 && answeredAt) {
    durationSec = Math.max(0, Math.floor((Date.now() - answeredAt) / 1000));
  }

  const built = await buildCallRecordFields({
    userId: session.user_id,
    voiceAgentId: session.voice_agent_id,
    agentName: agent.agentName,
    phoneNumber: meta.to,
    durationSec,
    disconnectReason: input.disconnectReason ?? "ElevenLabs call ended",
    transcript,
    callsCount: agent.callsCount,
    statusLabel: durationSec > 0 ? "Ended - Llamada premium exitosa" : "Ended - Sin conexión",
    metadata: {
      source: "phone_test",
      voice_provider: "elevenlabs",
      conversation_id: input.conversationId,
      from: meta.from,
      to: meta.to,
      finalized: true,
      finalized_at: new Date().toISOString(),
    },
  });
  const { dbFields, callsCountNext } = splitCallRecordFields(built);

  const db = adminClient();
  await db
    .from("voice_agent_calls")
    .update({
      ...dbFields,
      status: durationSec > 0 ? "ended_success" : "missed",
      metadata: {
        ...meta,
        ...dbFields.metadata,
        phone_test: true,
        voice_provider: "elevenlabs",
        phase: "ended",
        finalized: true,
      },
    })
    .eq("id", session.id);

  await updateAgentCallsCount(db, session.voice_agent_id, callsCountNext);

  if (durationSec > 0) {
    const orgId = await resolveOrgIdForUser(db, session.user_id);
    if (orgId) {
      await chargeVoiceCall({
        db,
        organizationId: orgId,
        userId: session.user_id,
        callId: session.id,
        durationSec,
        voiceAgentId: session.voice_agent_id,
        voiceProvider: "elevenlabs",
        metadata: { conversation_id: input.conversationId, source: "phone_test" },
      });
    }
  }

  await updatePhoneTestCallSession(input.conversationId, {
    phase: "ended",
    last_event: "elevenlabs.finalized",
    status_label: "Prueba premium - Finalizada",
  });
}
