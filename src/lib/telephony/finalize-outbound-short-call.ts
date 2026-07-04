import { adminClient } from "@/lib/voice-agents-server";
import { updateAgentCallsCount } from "@/lib/voice/persist-call-record";
import {
  getPhoneTestCallSession,
  managedOutboundKind,
  updatePhoneTestCallSession,
} from "@/lib/telephony/test-call-session";
import {
  managedOutboundOutcomeLabel,
  outcomeSummary,
  type OutboundCallOutcome,
} from "@/lib/telephony/call-outcome";
import {
  mapToCampaignAudienceOutcome,
  resolveCampaignContextFromSession,
  syncCampaignAudienceAfterCall,
} from "@/lib/call-engine/campaign-audience-status";

/**
 * Finaliza llamadas salientes cortas (buzón, no contestada, ocupado)
 * sin activar el agente ni cobrar créditos de conversación.
 */
export async function finalizeOutboundShortCall(input: {
  callControlId: string;
  outcome: OutboundCallOutcome;
  disconnectReason: string;
  amdResult?: string;
}): Promise<void> {
  const session = await getPhoneTestCallSession(input.callControlId);
  if (!session) {
    console.warn("[finalize-short-call] sesión no encontrada", input.callControlId);
    return;
  }

  const meta = session.metadata;
  if (meta.finalized) return;

  const kind = managedOutboundKind(meta as unknown as Record<string, unknown>);
  const isCrm = kind === "crm";
  const isCampaign = kind === "campaign";
  const isVoicemail = input.outcome === "voicemail";
  const statusLabel = managedOutboundOutcomeLabel(kind, input.outcome);
  const summary = outcomeSummary(input.outcome, meta.to, meta.agent_name);

  const db = adminClient();
  const now = new Date().toISOString();

  await db
    .from("voice_agent_calls")
    .update({
      duration_sec: 0,
      credits: 0,
      status: isVoicemail ? "voicemail" : "missed",
      status_label: statusLabel,
      in_voicemail: isVoicemail,
      disconnect_reason: input.disconnectReason,
      user_sentiment: "Neutral",
      summary,
      transcript: [],
      extracted_data: {},
      metadata: {
        ...meta,
        phone_test: kind === "test",
        crm_outbound: isCrm,
        campaign_outbound: isCampaign,
        phase: "ended",
        finalized: true,
        finalized_at: now,
        outcome: input.outcome,
        amd_result: input.amdResult ?? null,
        voicemail_detected: isVoicemail,
        agent_skipped: true,
      },
    })
    .eq("id", session.id);

  // Contabiliza el intento pero sin créditos de conversación.
  const { data: agentRow } = await db
    .from("voice_agents")
    .select("calls_count")
    .eq("id", session.voice_agent_id)
    .maybeSingle();
  await updateAgentCallsCount(db, session.voice_agent_id, Number(agentRow?.calls_count ?? 0) + 1);

  await updatePhoneTestCallSession(input.callControlId, {
    phase: "ended",
    last_event: `outcome.${input.outcome}`,
    status_label: statusLabel,
    summary,
    finalized: true,
    voicemail_detected: isVoicemail,
    amd_result: input.amdResult,
    outcome: input.outcome,
  });

  if (isCampaign) {
    const ctx = resolveCampaignContextFromSession(session);
    if (ctx) {
      await syncCampaignAudienceAfterCall({
        campaignId: ctx.campaignId,
        audienceRowId: ctx.audienceRowId,
        outcome: mapToCampaignAudienceOutcome({
          outcome: input.outcome,
          voicemailDetected: isVoicemail,
        }),
      });
    }
  }

  console.info("[finalize-short-call] ok", {
    callControlId: input.callControlId,
    outcome: input.outcome,
    amdResult: input.amdResult,
  });
}
