import { adminClient } from "@/lib/voice-agents-server";
import { getCallEngineRules } from "@/lib/call-engine/platform-config";
import { tryAutoCompleteCampaign } from "@/lib/call-engine/campaign-completion";
import type { OutboundCallOutcome } from "@/lib/telephony/call-outcome";
import type { CampaignCallStatus } from "@/types/voice-campaign";

/** Resultado técnico de un intento (conexión, buzón, rechazo…). No incluye CRM. */
export type CampaignTechnicalDisposition =
  | "connected"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "rejected"
  | "failed";

export const CAMPAIGN_WORKFLOW_STATUSES = ["pending", "calling", "retry"] as const;

export const CAMPAIGN_TERMINAL_STATUSES = [
  "connected",
  "voicemail",
  "no_answer",
  "busy",
  "rejected",
  "failed",
  "skipped",
] as const;

export function isCampaignWorkflowStatus(status: string): boolean {
  return (CAMPAIGN_WORKFLOW_STATUSES as readonly string[]).includes(status);
}

export function resolveCampaignContextFromSession(session: {
  campaign_id?: string | null;
  campaign_audience_row_id?: string | null;
  metadata?: unknown;
}): { campaignId: string; audienceRowId: string } | null {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const campaignId = String(session.campaign_id ?? meta.campaign_id ?? "").trim();
  const audienceRowId = String(
    session.campaign_audience_row_id ?? meta.campaign_audience_row_id ?? ""
  ).trim();
  if (!campaignId || !audienceRowId) return null;
  return { campaignId, audienceRowId };
}

/** Mapea el resultado de la llamada a tipificación técnica (no CRM). */
export function mapCallToTechnicalDisposition(input: {
  outcome?: OutboundCallOutcome | string;
  voicemailDetected?: boolean;
  userSpokeLive?: boolean;
}): CampaignTechnicalDisposition {
  if (input.voicemailDetected || input.outcome === "voicemail") return "voicemail";
  if (input.userSpokeLive === true) return "connected";
  if (input.outcome === "busy") return "busy";
  if (input.outcome === "rejected") return "rejected";
  if (input.outcome === "failed") return "failed";
  if (input.outcome === "no_answer") return "no_answer";
  if (input.outcome === "connected") return "no_answer";
  return "no_answer";
}

export function resolveAudienceStatusAfterAttempt(input: {
  disposition: CampaignTechnicalDisposition;
  attempts: number;
  maxAttempts: number;
  retryGapMinutes: number;
}): { call_status: CampaignCallStatus; scheduled_call_at: string | null } {
  const now = Date.now();

  if (input.disposition === "connected") {
    return { call_status: "connected", scheduled_call_at: null };
  }

  if (input.attempts < input.maxAttempts) {
    return {
      call_status: "retry",
      scheduled_call_at: new Date(now + input.retryGapMinutes * 60_000).toISOString(),
    };
  }

  return { call_status: input.disposition, scheduled_call_at: null };
}

export function dispositionFromPlacementError(message: string): CampaignTechnicalDisposition {
  const m = message.toLowerCase();
  if (m.includes("busy") || m.includes("ocupad")) return "busy";
  if (m.includes("reject") || m.includes("declin") || m.includes("rechaz")) return "rejected";
  return "failed";
}

export async function syncCampaignAudienceAfterCall(input: {
  campaignId: string;
  audienceRowId: string;
  disposition: CampaignTechnicalDisposition;
}): Promise<void> {
  const db = adminClient();
  const rules = await getCallEngineRules(db);

  const { data: campaignRaw } = await db
    .from("voice_campaigns")
    .select("schedule_config")
    .eq("id", input.campaignId)
    .maybeSingle();

  const scheduleConfig = (campaignRaw?.schedule_config ?? {}) as { max_attempts_per_contact?: number };

  const { data: row } = await db
    .from("campaign_audience_rows")
    .select("total_attempts")
    .eq("id", input.audienceRowId)
    .maybeSingle();

  if (!row) return;

  const now = new Date().toISOString();
  const attempts = Number(row.total_attempts) || 0;
  const maxAttempts = scheduleConfig.max_attempts_per_contact ?? 3;

  const resolved = resolveAudienceStatusAfterAttempt({
    disposition: input.disposition,
    attempts,
    maxAttempts,
    retryGapMinutes: rules.retry_gap_minutes,
  });

  await db
    .from("campaign_audience_rows")
    .update({
      call_status: resolved.call_status,
      scheduled_call_at: resolved.scheduled_call_at,
      updated_at: now,
    })
    .eq("id", input.audienceRowId);

  if (!isCampaignWorkflowStatus(resolved.call_status)) {
    await tryAutoCompleteCampaign(input.campaignId);
  }
}

/** Libera filas atascadas en "calling" tras un timeout. */
export async function releaseStuckCampaignRows(stuckMinutes = 12): Promise<number> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000).toISOString();

  const { data: stuck } = await db
    .from("campaign_audience_rows")
    .select("id, total_attempts, audience_table_id")
    .eq("call_status", "calling")
    .lt("last_attempt_at", cutoff);

  if (!stuck?.length) return 0;

  const rules = await getCallEngineRules(db);
  let released = 0;

  for (const row of stuck) {
    const { data: campaign } = await db
      .from("voice_campaigns")
      .select("schedule_config")
      .eq("audience_table_id", row.audience_table_id)
      .maybeSingle();
    if (!campaign) continue;

    const maxAttempts =
      ((campaign.schedule_config ?? {}) as { max_attempts_per_contact?: number })
        .max_attempts_per_contact ?? 3;

    const resolved = resolveAudienceStatusAfterAttempt({
      disposition: "no_answer",
      attempts: Number(row.total_attempts) || 0,
      maxAttempts,
      retryGapMinutes: rules.retry_gap_minutes,
    });

    await db
      .from("campaign_audience_rows")
      .update({
        call_status: resolved.call_status,
        scheduled_call_at: resolved.scheduled_call_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    released += 1;
  }

  return released;
}
