import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { autoMapCampaignColumnsFromSchema } from "@/lib/campaigns/column-mapping";
import type { DataTableColumn } from "@/types/data-table";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import type { CampaignTriggerRule } from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: { column_labels?: string[]; columns?: DataTableColumn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const labels = body.column_labels?.filter(Boolean) ?? [];
  const schemaCols = body.columns?.filter(c => c?.key && c?.label) ?? [];
  if (labels.length === 0 && schemaCols.length === 0) {
    return NextResponse.json({ error: "column_labels o columns requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: campaign, error } = await db
    .from("voice_campaigns")
    .select("trigger_rule")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const trigger = (campaign.trigger_rule ?? {}) as CampaignTriggerRule;
  const result =
    schemaCols.length > 0
      ? autoMapCampaignColumnsFromSchema(schemaCols, trigger.type === "excel_date")
      : autoMapCampaignColumnsFromSchema(
          labels.map((label, i) => ({
            key: label,
            label,
            type: "text" as const,
            filterable: false,
            display: true,
            required: false,
          })),
          trigger.type === "excel_date"
        );

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
