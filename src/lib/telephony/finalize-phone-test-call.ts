import { adminClient } from "@/lib/voice-agents-server";
import { buildCallRecordFields, updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import { getPhoneTestCallSession, updatePhoneTestCallSession, labelForPhase } from "@/lib/telephony/test-call-session";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export async function finalizePhoneTestCall(input: {
  callControlId: string;
  transcript: TranscriptEntry[];
  disconnectReason: string;
  durationSec?: number;
}): Promise<void> {
  const session = await getPhoneTestCallSession(input.callControlId);
  if (!session) {
    console.warn("[finalize-phone-test] sesión no encontrada", input.callControlId);
    return;
  }

  const meta = session.metadata;
  if (meta.finalized) {
    console.info("[finalize-phone-test] ya finalizada", input.callControlId);
    return;
  }

  const agent = await loadVoiceAgentForCall(session.voice_agent_id, session.user_id);
  if (!agent) {
    console.error("[finalize-phone-test] agente no encontrado", {
      callControlId: input.callControlId,
      voiceAgentId: session.voice_agent_id
    });
    return;
  }

  const answeredAt = meta.answered_at ? new Date(meta.answered_at).getTime() : null;
  const endedAt = Date.now();
  const durationSec = input.durationSec ?? (
    answeredAt ? Math.max(0, Math.floor((endedAt - answeredAt) / 1000)) : 0
  );

  const fields = await buildCallRecordFields({
    userId: session.user_id,
    voiceAgentId: session.voice_agent_id,
    agentName: agent.agentName,
    phoneNumber: meta.to,
    durationSec,
    disconnectReason: input.disconnectReason,
    transcript: input.transcript,
    callsCount: agent.callsCount,
    statusLabel: durationSec > 0 || input.transcript.length > 0
      ? "Ended - Llamada exitosa"
      : "Ended - Sin conexión",
    metadata: {
      source: "phone_test",
      call_control_id: input.callControlId,
      from: meta.from,
      to: meta.to,
      finalized: true,
      finalized_at: new Date().toISOString()
    }
  });

  const db = adminClient();
  const { error: updateError } = await db
    .from("voice_agent_calls")
    .update({
      ...fields,
      status: durationSec > 0 || input.transcript.length > 0 ? "ended_success" : "missed",
      metadata: {
        ...meta,
        ...fields.metadata,
        phone_test: true,
        phase: "ended",
        finalized: true
      }
    })
    .eq("id", session.id);

  if (updateError) {
    console.error("[finalize-phone-test] update failed:", updateError.message, session.id);
    throw new Error(updateError.message);
  }

  await updateAgentCallsCount(db, session.voice_agent_id, fields.callsCountNext);

  await updatePhoneTestCallSession(input.callControlId, {
    phase: "ended",
    last_event: "call.finalized",
    status_label: labelForPhase("ended")
  });

  console.info("[finalize-phone-test] ok", {
    callControlId: input.callControlId,
    sessionId: session.id,
    durationSec,
    transcriptLines: input.transcript.length,
    reason: input.disconnectReason
  });
}
