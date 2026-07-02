import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { autoMapCampaignColumns } from "@/lib/campaigns/auto-map-fields";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import type { CampaignTriggerRule } from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: { column_labels?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const labels = body.column_labels?.filter(Boolean) ?? [];
  if (labels.length === 0) {
    return NextResponse.json({ error: "column_labels requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: campaign, error } = await db
    .from("voice_campaigns")
    .select("trigger_rule")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const trigger = (campaign.trigger_rule ?? {}) as CampaignTriggerRule;
  const result = autoMapCampaignColumns(labels, trigger.type === "excel_date");

  const { data: updated, error: upErr } = await db
    .from("voice_campaigns")
    .update({
      field_mapping: {
        phone_column: result.phone_column ?? "",
        name_column: result.name_column ?? "",
        call_date_column: result.call_date_column,
        custom_fields: result.custom_fields,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    campaign: toVoiceCampaignRecord(updated),
    mapping: result,
  });
}
