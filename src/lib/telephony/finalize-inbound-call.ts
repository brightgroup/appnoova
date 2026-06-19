import { adminClient } from "@/lib/voice-agents-server";
import { chargeVoiceCall, resolveOrgIdForUser } from "@/lib/billing/meter";
import { estimateCallCredits } from "@/lib/voice-call-utils";

function parseTelnyxDurationSec(payload: Record<string, unknown>): number {
  const direct =
    Number(payload.call_duration ?? payload.duration ?? payload.duration_secs ?? 0) || 0;
  if (direct > 0) return Math.floor(direct);

  const start = payload.start_time ? new Date(String(payload.start_time)).getTime() : NaN;
  const end = payload.end_time ? new Date(String(payload.end_time)).getTime() : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.floor((end - start) / 1000);
  }
  return 0;
}

/** Finaliza y cobra llamadas entrantes de producción (sin puente Gemini). */
export async function finalizeInboundTelnyxCall(
  callControlId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const durationSec = parseTelnyxDurationSec(payload);
  if (durationSec <= 0) return;

  const db = adminClient();
  const { data: rows } = await db
    .from("voice_agent_calls")
    .select("id, user_id, voice_agent_id, metadata, duration_sec")
    .contains("metadata", { telnyx_call_id: callControlId })
    .limit(1);

  const call = rows?.[0];
  if (!call) return;

  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  if (meta.finalized) return;

  const credits = estimateCallCredits(durationSec);
  const now = new Date().toISOString();

  await db
    .from("voice_agent_calls")
    .update({
      duration_sec: durationSec,
      credits,
      status: "ended_success",
      status_label: "Inbound - Llamada finalizada",
      metadata: {
        ...meta,
        finalized: true,
        finalized_at: now,
        duration_sec: durationSec
      }
    })
    .eq("id", call.id);

  const orgId = await resolveOrgIdForUser(db, String(call.user_id));
  if (orgId) {
    await chargeVoiceCall({
      db,
      organizationId: orgId,
      userId: String(call.user_id),
      callId: String(call.id),
      durationSec,
      voiceAgentId: String(call.voice_agent_id),
      channel: "voice_inbound",
      metadata: { call_control_id: callControlId, source: "inbound" }
    });
  }
}
