import { adminClient } from "@/lib/voice-agents-server";
import { getCallEngineRules } from "@/lib/call-engine/platform-config";
import { tryAutoCompleteCampaign } from "@/lib/call-engine/campaign-completion";
import type { OutboundCallOutcome } from "@/lib/telephony/call-outcome";

export type CampaignAudienceOutcome = "completed" | "retry" | "failed";

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

export function mapToCampaignAudienceOutcome(input: {
  outcome?: OutboundCallOutcome | string;
  durationSec?: number;
  transcriptLength?: number;
  voicemailDetected?: boolean;
}): CampaignAudienceOutcome {
  if (input.voicemailDetected) return "retry";
  if ((input.durationSec ?? 0) > 0 && (input.transcriptLength ?? 0) > 0) return "completed";
  if ((input.durationSec ?? 0) > 15) return "completed";
  if (input.outcome === "completed" || input.outcome === "success") return "completed";
  return "retry";
}

export async function syncCampaignAudienceAfterCall(input: {
  campaignId: string;
  audienceRowId: string;
  outcome: CampaignAudienceOutcome;
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

  if (input.outcome === "completed") {
    await db
      .from("campaign_audience_rows")
      .update({ call_status: "completed", updated_at: now })
      .eq("id", input.audienceRowId);
    await tryAutoCompleteCampaign(input.campaignId);
    return;
  }

  if (input.outcome === "retry" && attempts < maxAttempts) {
    const next = new Date(Date.now() + rules.retry_gap_minutes * 60_000).toISOString();
    await db
      .from("campaign_audience_rows")
      .update({
        call_status: "retry",
        scheduled_call_at: next,
        updated_at: now,
      })
      .eq("id", input.audienceRowId);
    return;
  }

  await db
    .from("campaign_audience_rows")
    .update({ call_status: "failed", updated_at: now })
    .eq("id", input.audienceRowId);

  await tryAutoCompleteCampaign(input.campaignId);
}

/** Libera filas atascadas en "calling" tras un timeout. */
export async function releaseStuckCampaignRows(stuckMinutes = 12): Promise<number> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000).toISOString();

  const { data: stuck } = await db
    .from("campaign_audience_rows")
    .select("id")
    .eq("call_status", "calling")
    .lt("last_attempt_at", cutoff);

  if (!stuck?.length) return 0;

  const rules = await getCallEngineRules(db);
  const next = new Date(Date.now() + rules.retry_gap_minutes * 60_000).toISOString();
  const ids = stuck.map((r) => r.id);

  await db
    .from("campaign_audience_rows")
    .update({
      call_status: "retry",
      scheduled_call_at: next,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  return ids.length;
}
