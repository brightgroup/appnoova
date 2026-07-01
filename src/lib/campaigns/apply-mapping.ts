import type { CampaignFieldMapping, CampaignTriggerRule } from "@/types/voice-campaign";
import { computeScheduledCallAt, extractRowContactFields } from "@/lib/campaigns/audience-rows";

export async function applyAudienceMapping(
  db: ReturnType<typeof import("@/lib/voice-agents-server").adminClient>,
  audienceTableId: string,
  organizationId: string,
  mapping: CampaignFieldMapping,
  trigger: CampaignTriggerRule
): Promise<{ updated: number; skipped: number }> {
  const { data: rows, error } = await db
    .from("campaign_audience_rows")
    .select("id, data")
    .eq("audience_table_id", audienceTableId)
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const row of rows ?? []) {
    const data = (row.data ?? {}) as Record<string, string | number | boolean | null>;
    const { phone_e164, contact_name } = extractRowContactFields(data, mapping);
    if (!phone_e164 || !contact_name) {
      skipped += 1;
      continue;
    }
    const scheduled_call_at = computeScheduledCallAt(data, mapping, trigger);
    const { error: upErr } = await db
      .from("campaign_audience_rows")
      .update({
        phone_e164,
        contact_name,
        scheduled_call_at: scheduled_call_at?.toISOString() ?? null,
        call_status: scheduled_call_at ? "pending" : "skipped",
        updated_at: now,
      })
      .eq("id", row.id);
    if (!upErr) updated += 1;
  }

  return { updated, skipped };
}
