import type { adminClient } from "@/lib/voice-agents-server";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";

type Db = ReturnType<typeof adminClient>;

export async function duplicateVoiceCampaign(input: {
  db: Db;
  sourceId: string;
  organizationId: string;
  userId: string;
  name?: string;
}): Promise<VoiceCampaignRecord> {
  const { data: source, error } = await input.db
    .from("voice_campaigns")
    .select("*")
    .eq("id", input.sourceId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!source) throw new Error("Campaña no encontrada");

  const now = new Date().toISOString();
  const copyName = input.name?.trim() || `${String(source.name ?? "Campaña").trim()} (copia)`;

  const { data: created, error: insertErr } = await input.db
    .from("voice_campaigns")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      name: copyName,
      goal: source.goal,
      voice_agent_id: source.voice_agent_id,
      audience_table_id: null,
      status: "draft",
      wizard_step: source.audience_table_id ? 3 : Number(source.wizard_step ?? 2),
      campaign_type: source.campaign_type,
      output_fields: source.output_fields,
      crm_config: source.crm_config,
      schedule_config: source.schedule_config,
      trigger_rule: source.trigger_rule,
      field_mapping: source.field_mapping,
      prompt_template: source.prompt_template,
      completed_at: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return toVoiceCampaignRecord(created as Record<string, unknown>);
}
