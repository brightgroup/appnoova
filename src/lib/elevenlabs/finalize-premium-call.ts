import { adminClient } from "@/lib/voice-agents-server";
import { chargeVoiceCall, resolveOrgIdForUser } from "@/lib/billing/meter";
import { getElevenLabsConversation } from "@/lib/elevenlabs/outbound-call";
import {
  getElevenLabsConversationAudioWithRetry,
  waitForElevenLabsConversationReady,
} from "@/lib/elevenlabs/premium-voices";
import { uploadCallRecording } from "@/lib/voice-call-storage";
import { buildCallRecordFields, splitCallRecordFields, updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import { getPhoneTestCallSession, updatePhoneTestCallSession, managedOutboundKind } from "@/lib/telephony/test-call-session";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import type { TranscriptEntry } from "@/types/voice-agent-call";
import {
  transcriptIndicatesVoicemail,
  userHadLiveConversation,
} from "@/lib/voice-voicemail-detection";
import {
  mapCallToTechnicalDisposition,
  resolveCampaignContextFromSession,
  syncCampaignAudienceAfterCall,
} from "@/lib/call-engine/campaign-audience-status";
import { managedOutboundOutcomeLabel } from "@/lib/telephony/call-outcome";

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
  let voicemailDetected = false;

  if (durationSec <= 0 || transcript.length === 0) {
    try {
      const conv = await getElevenLabsConversation(input.conversationId);
      if (durationSec <= 0) durationSec = conv.callDurationSecs;
      if (transcript.length === 0) transcript = conv.transcript;
      voicemailDetected = conv.voicemailDetected;
    } catch (err) {
      console.warn("[elevenlabs-finalize] no se pudo leer conversación:", err);
    }
  } else {
    try {
      const conv = await getElevenLabsConversation(input.conversationId);
      voicemailDetected = conv.voicemailDetected;
      if (transcript.length === 0) transcript = conv.transcript;
    } catch {
      /* ignore */
    }
  }

  const voicemailFromContent = transcriptIndicatesVoicemail(transcript);
  if (!voicemailDetected && voicemailFromContent) {
    voicemailDetected = true;
  }

  if (voicemailDetected) {
    const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);
    const statusLabel = managedOutboundOutcomeLabel(kind, "voicemail");
    const db = adminClient();
    const now = new Date().toISOString();
    await db
      .from("voice_agent_calls")
      .update({
        duration_sec: durationSec,
        credits: 0,
        status: "voicemail",
        status_label: statusLabel,
        in_voicemail: true,
        disconnect_reason: "Buzón de voz detectado (ElevenLabs)",
        user_sentiment: "Neutral",
        summary: `Llamada a ${meta.to} fue a buzón de voz. El agente colgó sin continuar.`,
        transcript,
        extracted_data: {},
        metadata: {
          ...meta,
          phone_test: true,
          voice_provider: "elevenlabs",
          phase: "ended",
          finalized: true,
          finalized_at: now,
          outcome: "voicemail",
          voicemail_detected: true,
          agent_skipped: true,
          conversation_id: input.conversationId,
        },
      })
      .eq("id", session.id);

    await updateAgentCallsCount(db, session.voice_agent_id, agent.callsCount + 1);

    await updatePhoneTestCallSession(input.conversationId, {
      phase: "ended",
      last_event: "elevenlabs.voicemail",
      status_label: statusLabel,
      voicemail_detected: true,
      finalized: true,
    });

    if (kind === "campaign") {
      const ctx = resolveCampaignContextFromSession(session);
      if (ctx) {
        await syncCampaignAudienceAfterCall({
          campaignId: ctx.campaignId,
          audienceRowId: ctx.audienceRowId,
          disposition: "voicemail",
        });
      }
    }
    return;
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
    statusLabel: durationSec > 0 ? "Ended - Llamada premium exitosa" : "Ended - Error de conexión",
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

  let audioUrl: string | null = null;
  try {
    await waitForElevenLabsConversationReady(input.conversationId, { maxAttempts: 8, delayMs: 750 });
    const audio = await getElevenLabsConversationAudioWithRetry(input.conversationId, {
      maxAttempts: 5,
      delayMs: 1200,
    });
    if (audio?.buffer.length) {
      audioUrl = await uploadCallRecording(
        db,
        session.user_id,
        session.id,
        audio.buffer,
        audio.contentType || "audio/mpeg"
      );
    }
  } catch (err) {
    console.warn("[elevenlabs-finalize] audio:", err);
  }

  await db
    .from("voice_agent_calls")
    .update({
      ...dbFields,
      ...(audioUrl ? { audio_url: audioUrl } : {}),
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

  const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);
  if (kind === "campaign") {
    const ctx = resolveCampaignContextFromSession(session);
    if (ctx) {
      const disposition = mapCallToTechnicalDisposition({
        userSpokeLive: userHadLiveConversation(transcript),
      });
      await syncCampaignAudienceAfterCall({
        campaignId: ctx.campaignId,
        audienceRowId: ctx.audienceRowId,
        disposition,
      });
      if (disposition === "connected") {
        try {
          const { captureCampaignCallResults } = await import("@/lib/campaigns/capture-results");
          await captureCampaignCallResults({
            campaignId: ctx.campaignId,
            audienceRowId: ctx.audienceRowId,
            callId: session.id,
            transcript,
          });
        } catch (err) {
          console.error("[elevenlabs-finalize] campaign capture:", err);
        }
      }
    }
  }
}
