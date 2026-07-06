import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET — vista Resultados: una fila por prospecto con lo capturado por la IA.
 * Con ?row_id=… devuelve el detalle de todas las llamadas de ese prospecto.
 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data: campaignRaw, error: campErr } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaignRaw) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const campaign = toVoiceCampaignRecord(campaignRaw as Record<string, unknown>);

  const rowId = req.nextUrl.searchParams.get("row_id");
  if (rowId) {
    const { data: calls, error: callsErr } = await db
      .from("voice_agent_calls")
      .select(
        "id, created_at, duration_sec, status, status_label, in_voicemail, summary, transcript, audio_url, extracted_data"
      )
      .eq("campaign_id", id)
      .eq("campaign_audience_row_id", rowId)
      .order("created_at", { ascending: false });

    if (callsErr) return NextResponse.json({ error: callsErr.message }, { status: 500 });
    return NextResponse.json({ calls: calls ?? [] });
  }

  if (!campaign.audience_table_id) {
    return NextResponse.json({ output_fields: campaign.output_fields, rows: [] });
  }

  const { data: rows, error: rowsErr } = await db
    .from("campaign_audience_rows")
    .select(
      "id, contact_name, phone_e164, call_status, total_attempts, last_attempt_at, results, results_meta, result_primary, excluded_reason, crm_contact_id, crm_lead_id"
    )
    .eq("audience_table_id", campaign.audience_table_id)
    .eq("organization_id", auth.organizationId)
    .order("sort_order", { ascending: true });

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  return NextResponse.json({
    output_fields: campaign.output_fields,
    campaign_type: campaign.campaign_type,
    rows: rows ?? [],
  });
}
