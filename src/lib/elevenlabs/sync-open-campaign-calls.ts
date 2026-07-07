import { getElevenLabsConversation, mapElevenLabsStatusToPhase } from "@/lib/elevenlabs/outbound-call";
import { finalizeElevenLabsPremiumCall } from "@/lib/elevenlabs/finalize-premium-call";
import { finalizeOutboundShortCall } from "@/lib/telephony/finalize-outbound-short-call";
import { isMachineAmdResult, type OutboundCallOutcome } from "@/lib/telephony/call-outcome";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Cierra registros atascados: metadata.finalized pero status in_progress.
 * Esas filas bloquean el cupo global del marcador (max_concurrent).
 */
export async function reconcileFinalizedInProgressCampaignCalls(): Promise<number> {
  const db = adminClient();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, duration_sec, metadata")
    .eq("status", "in_progress")
    .not("campaign_id", "is", null);

  if (error || !rows?.length) return 0;

  let fixed = 0;
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (!meta.finalized) continue;

    const outcome = String(meta.outcome ?? "").trim();
    const isVoicemail = meta.voicemail_detected === true || outcome === "voicemail";
    const duration = Number(row.duration_sec) || 0;
    const hadConversation = duration > 0 || Boolean(meta.answered_at);

    const status = isVoicemail ? "voicemail" : hadConversation ? "ended_success" : "missed";

    const { error: upErr } = await db
      .from("voice_agent_calls")
      .update({
        status,
        metadata: { ...meta, phase: "ended" },
      })
      .eq("id", row.id)
      .eq("status", "in_progress");

    if (!upErr) fixed += 1;
  }

  if (fixed > 0) {
    console.info("[reconcile-finalized-campaign-calls] liberadas:", fixed);
  }
  return fixed;
}

/** Cierra llamadas de campaña muy antiguas aún en in_progress (zombies sin finalized). */
export async function reconcileStaleInProgressCampaignCalls(stuckMinutes = 20): Promise<number> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000).toISOString();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, metadata")
    .eq("status", "in_progress")
    .not("campaign_id", "is", null)
    .lt("created_at", cutoff);

  if (error || !rows?.length) return 0;

  let fixed = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.finalized) continue;

    const { error: upErr } = await db
      .from("voice_agent_calls")
      .update({
        status: "missed",
        metadata: {
          ...meta,
          finalized: true,
          phase: "ended",
          outcome: "no_answer",
          ended_at: now,
        },
      })
      .eq("id", row.id)
      .eq("status", "in_progress");

    if (!upErr) fixed += 1;
  }

  if (fixed > 0) {
    console.info("[reconcile-stale-campaign-calls] liberadas:", fixed);
  }
  return fixed;
}

/**
 * Finaliza llamadas ElevenLabs de campaña que quedaron en in_progress
 * (el marcador no hace polling como la prueba telefónica).
 */
export async function syncStuckCampaignScreeningCalls(stuckMinutes = 4): Promise<number> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000).toISOString();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, metadata, created_at")
    .eq("status", "in_progress")
    .not("campaign_id", "is", null)
    .lt("created_at", cutoff);

  if (error || !rows?.length) return 0;

  let synced = 0;
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.finalized) continue;

    const callControlId = String(meta.call_control_id ?? "").trim();
    if (!callControlId) continue;

    const isElScreening =
      meta.el_deferred_amd === true && !meta.conversation_id && !meta.el_connected;
    const isGoogle = meta.voice_provider === "google";
    if (!isElScreening && !isGoogle) continue;

    const amdResult = String(meta.amd_result ?? "").trim();
    const wasVoicemail =
      meta.voicemail_detected === true || (amdResult ? isMachineAmdResult(amdResult) : false);
    const outcome: OutboundCallOutcome = wasVoicemail ? "voicemail" : "no_answer";

    try {
      await finalizeOutboundShortCall({
        callControlId,
        outcome,
        disconnectReason: wasVoicemail
          ? amdResult
            ? `Buzón de voz (${amdResult})`
            : "Buzón de voz detectado"
          : isElScreening
            ? "No contestada (verificación AMD sin respuesta)"
            : "No contestada (llamada sin finalizar)",
        amdResult: amdResult || undefined,
      });
      synced += 1;
    } catch (err) {
      console.warn("[sync-stuck-screening]", callControlId, err);
    }
  }

  if (synced > 0) {
    console.info("[sync-stuck-screening] liberadas:", synced);
  }
  return synced;
}

export async function syncOpenElevenLabsCampaignCalls(): Promise<number> {
  const db = adminClient();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, metadata, status")
    .eq("status", "in_progress")
    .not("campaign_id", "is", null);

  if (error || !rows?.length) return 0;

  let synced = 0;
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.finalized) continue;
    if (meta.el_deferred_amd && !meta.conversation_id) continue;

    const conversationId = String(meta.conversation_id ?? meta.call_control_id ?? "").trim();
    if (conversationId.startsWith("pending:")) continue;
    const isElevenLabs =
      meta.voice_provider === "elevenlabs" ||
      conversationId.startsWith("conv_");
    if (!conversationId || !isElevenLabs) continue;

    try {
      const conv = await getElevenLabsConversation(conversationId);
      const phase = mapElevenLabsStatusToPhase(conv.status);
      if (phase !== "ended" && phase !== "failed") continue;

      await finalizeElevenLabsPremiumCall({
        conversationId,
        durationSec: conv.callDurationSecs,
        transcript: conv.transcript,
        disconnectReason: conv.terminationReason ?? conv.status,
      });
      synced += 1;
    } catch (err) {
      console.warn("[sync-el-campaign-calls]", conversationId, err);
    }
  }

  if (synced > 0) {
    console.info("[sync-el-campaign-calls] finalizadas:", synced);
  }
  return synced;
}
