import { getElevenLabsConversation, mapElevenLabsStatusToPhase } from "@/lib/elevenlabs/outbound-call";
import { finalizeElevenLabsPremiumCall } from "@/lib/elevenlabs/finalize-premium-call";
import { finalizeOutboundShortCall } from "@/lib/telephony/finalize-outbound-short-call";
import { isMachineAmdResult, type OutboundCallOutcome } from "@/lib/telephony/call-outcome";
import { getElevenLabsConversationAudioWithRetry } from "@/lib/elevenlabs/premium-voices";
import { uploadCallRecording } from "@/lib/voice-call-storage";
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

/**
 * Baja de ElevenLabs las grabaciones que no se guardaron al finalizar (el audio
 * no estaba renderizado en ese instante y el webhook post-llamada está apagado).
 * Cubre también buzones. Se ejecuta unos minutos después, cuando el audio ya existe.
 */
export async function backfillMissingCampaignAudio(limit = 8): Promise<number> {
  const db = adminClient();
  // Ventana: entre 30 s (dar tiempo a renderizar) y 3 h atrás.
  const minAge = new Date(Date.now() - 30_000).toISOString();
  const maxAge = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, user_id, metadata, created_at")
    .not("campaign_id", "is", null)
    .is("audio_url", null)
    .in("status", ["ended_success", "voicemail"])
    .lt("created_at", minAge)
    .gte("created_at", maxAge)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error || !rows?.length) return 0;

  let saved = 0;
  for (const row of rows) {
    if (saved >= limit) break;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const conversationId = String(meta.conversation_id ?? "").trim();
    if (!conversationId.startsWith("conv_")) continue;
    if (Number(meta.audio_backfill_attempts ?? 0) >= 5) continue;

    try {
      const audio = await getElevenLabsConversationAudioWithRetry(conversationId, {
        maxAttempts: 2,
        delayMs: 1000,
      });
      if (audio?.buffer.length) {
        const audioUrl = await uploadCallRecording(
          db,
          row.user_id,
          row.id,
          audio.buffer,
          audio.contentType || "audio/mpeg"
        );
        if (audioUrl) {
          await db
            .from("voice_agent_calls")
            .update({ audio_url: audioUrl })
            .eq("id", row.id);
          saved += 1;
          continue;
        }
      }
      // Marca el intento para no reintentar indefinidamente audios que nunca llegan.
      await db
        .from("voice_agent_calls")
        .update({
          metadata: { ...meta, audio_backfill_attempts: Number(meta.audio_backfill_attempts ?? 0) + 1 },
        })
        .eq("id", row.id);
    } catch (err) {
      console.warn("[backfill-audio]", conversationId, err instanceof Error ? err.message : err);
    }
  }

  if (saved > 0) console.info("[backfill-audio] grabaciones recuperadas:", saved);
  return saved;
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
