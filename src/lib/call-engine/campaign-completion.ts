import { adminClient } from "@/lib/voice-agents-server";
import type { CampaignCallStatus } from "@/types/voice-campaign";

const WORK_REMAINING_STATUSES: CampaignCallStatus[] = ["pending", "retry", "calling"];

export interface CampaignAudienceProgress {
  total: number;
  pending: number;
  calling: number;
  retry: number;
  completed: number;
  failed: number;
  skipped: number;
  /** Filas activas que aún pueden recibir llamadas o están en curso. */
  has_work_remaining: boolean;
}

export async function getCampaignAudienceProgress(
  audienceTableId: string
): Promise<CampaignAudienceProgress> {
  const db = adminClient();
  const { data: rows, error } = await db
    .from("campaign_audience_rows")
    .select("call_status")
    .eq("audience_table_id", audienceTableId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const counts = {
    total: 0,
    pending: 0,
    calling: 0,
    retry: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows ?? []) {
    counts.total += 1;
    const status = String(row.call_status ?? "pending") as CampaignCallStatus;
    if (status === "pending") counts.pending += 1;
    else if (status === "calling") counts.calling += 1;
    else if (status === "retry") counts.retry += 1;
    else if (status === "completed") counts.completed += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "skipped") counts.skipped += 1;
  }

  const hasWorkRemaining =
    counts.pending + counts.retry + counts.calling > 0;

  return { ...counts, has_work_remaining: hasWorkRemaining };
}

async function campaignHasInProgressCalls(campaignId: string): Promise<boolean> {
  const db = adminClient();
  const { count, error } = await db
    .from("voice_agent_calls")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "in_progress");

  if (error) {
    console.error("[campaign-completion] count in_progress:", error.message);
    return true;
  }
  return (count ?? 0) > 0;
}

/**
 * Marca la campaña como finalizada cuando todos los contactos activos
 * están en estado terminal (completed / failed / skipped) y no hay llamadas en curso.
 */
export async function tryAutoCompleteCampaign(campaignId: string): Promise<boolean> {
  const db = adminClient();

  const { data: campaign, error } = await db
    .from("voice_campaigns")
    .select("id, status, audience_table_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) return false;
  if (campaign.status !== "active") return false;
  if (!campaign.audience_table_id) return false;

  if (await campaignHasInProgressCalls(campaignId)) return false;

  const progress = await getCampaignAudienceProgress(campaign.audience_table_id);
  if (progress.total === 0 || progress.has_work_remaining) return false;

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await db
    .from("voice_campaigns")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", campaignId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (upErr || !updated) return false;

  console.info("[campaign-completion] finalizada:", {
    campaignId,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    skipped: progress.skipped,
  });

  return true;
}

/** Revisa todas las campañas activas y finaliza las que ya agotaron su audiencia. */
export async function tryAutoCompleteActiveCampaigns(): Promise<string[]> {
  const db = adminClient();
  const { data: campaigns, error } = await db
    .from("voice_campaigns")
    .select("id")
    .eq("status", "active")
    .not("audience_table_id", "is", null);

  if (error || !campaigns?.length) return [];

  const completed: string[] = [];
  for (const c of campaigns) {
    try {
      if (await tryAutoCompleteCampaign(String(c.id))) {
        completed.push(String(c.id));
      }
    } catch (err) {
      console.error("[campaign-completion] tick error:", c.id, err);
    }
  }
  return completed;
}
