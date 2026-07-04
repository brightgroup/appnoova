import { adminClient } from "@/lib/voice-agents-server";
import { buildCallRecordFields, splitCallRecordFields, updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import { getPhoneTestCallSession, updatePhoneTestCallSession, labelForManagedOutboundPhase, managedOutboundKind } from "@/lib/telephony/test-call-session";
import { managedOutboundOutcomeLabel } from "@/lib/telephony/call-outcome";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import { uploadCallRecording } from "@/lib/voice-call-storage";
import { chargeVoiceCall, resolveOrgIdForUser } from "@/lib/billing/meter";
import {
  mapCallToTechnicalDisposition,
  resolveCampaignContextFromSession,
  syncCampaignAudienceAfterCall,
} from "@/lib/call-engine/campaign-audience-status";
import { userHadLiveConversation } from "@/lib/voice-voicemail-detection";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export async function finalizePhoneTestCall(input: {
  callControlId: string;
  transcript: TranscriptEntry[];
  disconnectReason: string;
  durationSec?: number;
  audioBase64?: string;
  audioMime?: string;
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

  const built = await buildCallRecordFields({
    userId: session.user_id,
    voiceAgentId: session.voice_agent_id,
    agentName: agent.agentName,
    phoneNumber: meta.to,
    durationSec,
    disconnectReason: input.disconnectReason,
    transcript: input.transcript,
    callsCount: agent.callsCount,
    statusLabel: durationSec > 0 || input.transcript.length > 0
      ? input.transcript.length > 0
        ? "Ended - Llamada exitosa"
        : "Ended - Conectada sin transcripción"
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
  const { dbFields, callsCountNext } = splitCallRecordFields(built);

  const db = adminClient();
  const { error: updateError } = await db
    .from("voice_agent_calls")
    .update({
      ...dbFields,
      status: durationSec > 0 || input.transcript.length > 0 ? "ended_success" : "missed",
      metadata: {
        ...meta,
        ...dbFields.metadata,
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

  if (input.audioBase64 && input.audioBase64.length > 0) {
    const buf = Buffer.from(input.audioBase64, "base64");
    if (buf.length > 500) {
      const audioUrl = await uploadCallRecording(
        db,
        session.user_id,
        session.id,
        buf,
        input.audioMime || "audio/wav"
      );
      if (audioUrl) {
        await db.from("voice_agent_calls").update({ audio_url: audioUrl }).eq("id", session.id);
      } else {
        console.error("[finalize-phone-test] no se pudo subir audio", session.id);
      }
    }
  }

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
        voiceProvider: agent.config.voice_provider === "elevenlabs" ? "elevenlabs" : "google",
        metadata: { call_control_id: input.callControlId, source: "phone_test" }
      });
    }
  }

  const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);
  const connected = durationSec > 0 || input.transcript.length > 0;
  const finalStatusLabel = connected
    ? labelForManagedOutboundPhase("ended", kind)
    : managedOutboundOutcomeLabel(kind, "no_answer");

  await db
    .from("voice_agent_calls")
    .update({
      status_label: finalStatusLabel,
      ...(connected ? {} : { status: "missed", in_voicemail: false }),
    })
    .eq("id", session.id);

  await updatePhoneTestCallSession(input.callControlId, {
    phase: "ended",
    last_event: "call.finalized",
    status_label: finalStatusLabel,
    ...(connected ? {} : { outcome: "no_answer" }),
  });

  if (kind === "campaign") {
    const ctx = resolveCampaignContextFromSession(session);
    if (ctx) {
      await syncCampaignAudienceAfterCall({
        campaignId: ctx.campaignId,
        audienceRowId: ctx.audienceRowId,
        disposition: mapCallToTechnicalDisposition({
          userSpokeLive: userHadLiveConversation(input.transcript),
        }),
      });
    }
  }

  console.info("[finalize-phone-test] ok", {
    callControlId: input.callControlId,
    sessionId: session.id,
    durationSec,
    transcriptLines: input.transcript.length,
    reason: input.disconnectReason
  });
}
