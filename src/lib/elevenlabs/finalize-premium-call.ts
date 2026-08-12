import { adminClient } from "@/lib/voice-agents-server";
import { chargeVoiceCall, chargeVoiceAttempt, recordUsageSafe, resolveOrgIdForUser } from "@/lib/billing/meter";
import {
  conversationIsVoicemail,
  loadElevenLabsConversationForFinalize,
} from "@/lib/elevenlabs/finalize-conversation";
import {
  getElevenLabsConversationAudioWithRetry,
} from "@/lib/elevenlabs/premium-voices";
import { uploadCallRecording } from "@/lib/voice-call-storage";
import { buildCallRecordFields, splitCallRecordFields, updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import { getPhoneTestCallSession, updatePhoneTestCallSession, managedOutboundKind } from "@/lib/telephony/test-call-session";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import type { TranscriptEntry } from "@/types/voice-agent-call";
import { userHadLiveConversation } from "@/lib/voice-voicemail-detection";
import {
  mapCallToTechnicalDisposition,
  resolveCampaignContextFromSession,
  syncCampaignAudienceAfterCall,
} from "@/lib/call-engine/campaign-audience-status";
import { managedOutboundOutcomeLabel, outcomeSummary } from "@/lib/telephony/call-outcome";

function managedMetadataFlags(kind: "test" | "crm" | "campaign") {
  return {
    phone_test: kind === "test",
    crm_outbound: kind === "crm",
    campaign_outbound: kind === "campaign",
  };
}

function campaignOutcomeLabel(transcript: TranscriptEntry[], durationSec: number): string {
  if (!userHadLiveConversation(transcript)) return "Campaña — Sin conversación";
  const userTurns = transcript.filter(t => t.role === "user" && t.text.trim().length > 8).length;
  const agentTurns = transcript.filter(t => t.role === "agent" && t.text.trim().length > 8).length;
  if (userTurns >= 2 && agentTurns >= 2 && durationSec >= 45) return "Campaña — Llamada exitosa";
  if (userTurns >= 1 && agentTurns >= 1) return "Campaña — Conversación incompleta";
  return "Campaña — Sin desarrollo";
}

async function finalizeAsVoicemail(input: {
  session: NonNullable<Awaited<ReturnType<typeof getPhoneTestCallSession>>>;
  agent: NonNullable<Awaited<ReturnType<typeof loadVoiceAgentForCall>>>;
  conversationId: string;
  durationSec: number;
  transcript: TranscriptEntry[];
  disconnectReason: string;
}): Promise<void> {
  const { session, agent, conversationId, durationSec, transcript } = input;
  const meta = session.metadata;
  const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);
  const statusLabel = managedOutboundOutcomeLabel(kind, "voicemail");
  const summary = outcomeSummary("voicemail", meta.to, meta.agent_name);
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
      disconnect_reason: input.disconnectReason,
      user_sentiment: "Neutral",
      summary,
      transcript,
      extracted_data: {},
      metadata: {
        ...meta,
        ...managedMetadataFlags(kind),
        voice_provider: "elevenlabs",
        phase: "ended",
        finalized: true,
        finalized_at: now,
        outcome: "voicemail",
        voicemail_detected: true,
        agent_skipped: true,
        conversation_id: conversationId,
      },
    })
    .eq("id", session.id);

  await updateAgentCallsCount(db, session.voice_agent_id, agent.callsCount + 1);

  await updatePhoneTestCallSession(conversationId, {
    phase: "ended",
    last_event: "elevenlabs.voicemail",
    status_label: statusLabel,
    summary,
    voicemail_detected: true,
    outcome: "voicemail",
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

  const orgId = await resolveOrgIdForUser(db, session.user_id);
  if (orgId) {
    await chargeVoiceAttempt({
      db,
      organizationId: orgId,
      userId: session.user_id,
      callId: session.id,
      eventType: "voice_voicemail",
      voiceAgentId: session.voice_agent_id,
      metadata: {
        outcome: "voicemail",
        conversation_id: conversationId,
        campaign_outbound: kind === "campaign",
        agent_skipped: true,
        el_voicemail_after_connect: true,
      },
    });
  }
}

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

  const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);

  let conv;
  try {
    conv = await loadElevenLabsConversationForFinalize(input.conversationId);
  } catch (err) {
    console.warn("[elevenlabs-finalize] no se pudo leer conversación:", err);
    conv = null;
  }

  const durationSec = conv?.callDurationSecs ?? input.durationSec ?? 0;
  const transcript = conv?.transcript?.length ? conv.transcript : (input.transcript ?? []);
  const disconnectReason =
    input.disconnectReason ??
    conv?.terminationReason ??
    conv?.errorReason ??
    "ElevenLabs call ended";

  if (conv && conversationIsVoicemail(conv)) {
    await finalizeAsVoicemail({
      session,
      agent,
      conversationId: input.conversationId,
      durationSec,
      transcript,
      disconnectReason: "Buzón de voz detectado",
    });
    return;
  }

  const answeredAt = meta.answered_at ? new Date(meta.answered_at).getTime() : null;
  let billedDuration = durationSec;
  if (billedDuration <= 0 && answeredAt) {
    billedDuration = Math.max(0, Math.floor((Date.now() - answeredAt) / 1000));
  }

  const successLabel =
    kind === "campaign"
      ? campaignOutcomeLabel(transcript, billedDuration)
      : kind === "crm"
        ? "Llamada IA — Finalizada"
        : "Prueba premium - Finalizada";

  const built = await buildCallRecordFields({
    userId: session.user_id,
    voiceAgentId: session.voice_agent_id,
    agentName: agent.agentName,
    phoneNumber: meta.to,
    durationSec: billedDuration,
    disconnectReason,
    transcript,
    callsCount: agent.callsCount,
    statusLabel: billedDuration > 0 ? successLabel : "Ended - Error de conexión",
    metadata: {
      source: kind === "test" ? "phone_test" : kind,
      voice_provider: "elevenlabs",
      conversation_id: input.conversationId,
      from: meta.from,
      to: meta.to,
      finalized: true,
      finalized_at: new Date().toISOString(),
    },
  });
  const { dbFields, callsCountNext, analysisUsage } = splitCallRecordFields(built);

  const db = adminClient();

  let audioUrl: string | null = null;
  try {
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
      status: billedDuration > 0 ? "ended_success" : "missed",
      status_label: billedDuration > 0 ? successLabel : managedOutboundOutcomeLabel(kind, "no_answer"),
      in_voicemail: false,
      metadata: {
        ...meta,
        ...dbFields.metadata,
        ...managedMetadataFlags(kind),
        voice_provider: "elevenlabs",
        phase: "ended",
        finalized: true,
        conversation_id: input.conversationId,
      },
    })
    .eq("id", session.id);

  await updateAgentCallsCount(db, session.voice_agent_id, callsCountNext);

  const orgIdForAnalysis = await resolveOrgIdForUser(db, session.user_id);
  if (orgIdForAnalysis && analysisUsage && analysisUsage.totalTokens > 0) {
    // Análisis post-llamada automático (resumen, sentimiento, datos extraídos) —
    // costo real visible en /admin/consumption, sin cobrar crédito aparte (ya
    // se cobró el minuto de la llamada).
    await recordUsageSafe({
      db,
      organizationId: orgIdForAnalysis,
      userId: session.user_id,
      eventType: "ori",
      provider: "google",
      model: "gemini-2.5-flash",
      gemini: analysisUsage,
      creditsOverride: 0,
      channel: "voice_call_analysis",
      referenceType: "voice_agent_call",
      referenceId: session.id,
      idempotencyKey: `call_analysis_${session.id}`
    });
  }

  if (billedDuration > 0 && orgIdForAnalysis) {
    await chargeVoiceCall({
      db,
      organizationId: orgIdForAnalysis,
      userId: session.user_id,
      callId: session.id,
      durationSec: billedDuration,
      voiceAgentId: session.voice_agent_id,
      voiceProvider: "elevenlabs",
      metadata: { conversation_id: input.conversationId, source: kind },
    });
  }

  await updatePhoneTestCallSession(input.conversationId, {
    phase: "ended",
    last_event: "elevenlabs.finalized",
    status_label: successLabel,
  });

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
