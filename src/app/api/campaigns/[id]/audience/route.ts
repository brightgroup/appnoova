import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import { analyzeAudienceAgainstCrm, commitAudienceImport } from "@/lib/campaigns/import-contacts";
import { computeScheduledCallAt } from "@/lib/campaigns/audience-rows";
import type {
  CampaignFieldMapping,
  CampaignImportPolicy,
  CampaignImportResult,
  CampaignTriggerRule,
} from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import { autoMapCampaignColumnsFromSchema } from "@/lib/campaigns/column-mapping";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data: campaign, error: campErr } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseExcelBuffer(await file.arrayBuffer(), file.name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo leer el Excel" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const tableName = String(form.get("name") ?? "").trim() || parsed.suggestedName;

    const mappingRaw = form.get("field_mapping");
    let fieldMappingOverride: CampaignFieldMapping | null = null;
    if (typeof mappingRaw === "string" && mappingRaw.trim()) {
      try {
        fieldMappingOverride = JSON.parse(mappingRaw) as CampaignFieldMapping;
      } catch {
        return NextResponse.json({ error: "field_mapping inválido" }, { status: 400 });
      }
    }

    const triggerNeedsDate =
      (campaign.trigger_rule as { type?: string })?.type === "excel_date";
    const fieldMapping =
      fieldMappingOverride ??
      autoMapCampaignColumnsFromSchema(parsed.columns, triggerNeedsDate);

    const policyRaw = String(form.get("contact_policy") ?? "skip");
    const policy: CampaignImportPolicy =
      policyRaw === "fill_empty" || policyRaw === "overwrite" ? policyRaw : "skip";

    const campaignRecord = toVoiceCampaignRecord(campaign as Record<string, unknown>);
    const trigger = campaignRecord.trigger_rule as CampaignTriggerRule;

    // Cruce contra CRM por teléfono, deduplicación y detección de "no contactar".
    const { analyzed, summary } = await analyzeAudienceAgainstCrm(
      db,
      String(campaign.user_id),
      parsed.rows,
      fieldMapping,
      parsed.columns
    );

    const { data: table, error: tableErr } = await db
      .from("campaign_audience_tables")
      .insert({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        name: tableName,
        description: `Audiencia de campaña · ${campaign.name}`,
        columns: parsed.columns,
        row_count: 0,
        source_file_name: file.name,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (tableErr) return NextResponse.json({ error: tableErr.message }, { status: 500 });

    const commit = await commitAudienceImport({
      db,
      userId: String(campaign.user_id),
      organizationId: auth.organizationId,
      campaignId: id,
      campaignName: String(campaign.name ?? ""),
      audienceTableId: table.id,
      analyzed,
      mapping: fieldMapping,
      columns: parsed.columns,
      policy,
      createLeads:
        campaignRecord.crm_config.create_leads === "on_import"
          ? { stageId: campaignRecord.crm_config.pipeline_stage_id }
          : undefined,
      scheduledCallAtFor: data =>
        computeScheduledCallAt(data, fieldMapping, trigger)?.toISOString() ?? null,
    });

    const rowPayload = commit.rowsPayload.map(row => ({
      audience_table_id: table.id,
      organization_id: auth.organizationId,
      is_active: true,
      created_at: now,
      updated_at: now,
      ...row,
    }));

    const chunk = 200;
    for (let i = 0; i < rowPayload.length; i += chunk) {
      const { error: rowsErr } = await db
        .from("campaign_audience_rows")
        .insert(rowPayload.slice(i, i + chunk));
      if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    await db
      .from("campaign_audience_tables")
      .update({ row_count: rowPayload.length, updated_at: now })
      .eq("id", table.id);

    const { data: updated, error: linkErr } = await db
      .from("voice_campaigns")
      .update({
        audience_table_id: table.id,
        field_mapping: fieldMapping,
        wizard_step: 3,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    const importResult: CampaignImportResult = {
      created_contacts: commit.createdContacts,
      linked_contacts: commit.linkedContacts,
      enrolled: commit.enrolled,
      rejected: summary.invalid_phone,
      suppressed: commit.suppressed,
      leads_created: commit.leadsCreated,
      rejected_rows: summary.rejected_rows,
    };

    return NextResponse.json({
      campaign: toVoiceCampaignRecord(updated),
      audience_table_id: table.id,
      row_count: rowPayload.length,
      auto_map: fieldMapping,
      import_result: importResult,
    });
  }

  let body: { audience_table_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const audienceTableId = body.audience_table_id?.trim();
  if (!audienceTableId) {
    return NextResponse.json({ error: "audience_table_id requerido" }, { status: 400 });
  }

  const { data: table, error: tableErr } = await db
    .from("campaign_audience_tables")
    .select("id, columns")
    .eq("id", audienceTableId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (tableErr) return NextResponse.json({ error: tableErr.message }, { status: 500 });
  if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const columns = (Array.isArray(table.columns) ? table.columns : []) as DataTableColumn[];
  const triggerNeedsDate =
    (campaign.trigger_rule as { type?: string })?.type === "excel_date";
  const fieldMapping = autoMapCampaignColumnsFromSchema(columns, triggerNeedsDate);

  const now = new Date().toISOString();
  const { data: updated, error: linkErr } = await db
    .from("voice_campaigns")
    .update({
      audience_table_id: audienceTableId,
      field_mapping: fieldMapping,
      wizard_step: 3,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({
    campaign: toVoiceCampaignRecord(updated),
    audience_table_id: audienceTableId,
    auto_map: fieldMapping,
  });
}
