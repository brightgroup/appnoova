import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import { autoMapCampaignColumns } from "@/lib/campaigns/auto-map-fields";

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
    .eq("user_id", auth.userId)
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

    const { data: table, error: tableErr } = await db
      .from("campaign_audience_tables")
      .insert({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        name: tableName,
        description: `Audiencia de campaña · ${campaign.name}`,
        columns: parsed.columns,
        row_count: parsed.rows.length,
        source_file_name: file.name,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (tableErr) return NextResponse.json({ error: tableErr.message }, { status: 500 });

    const rowPayload = parsed.rows.map((row, i) => ({
      audience_table_id: table.id,
      organization_id: auth.organizationId,
      data: row,
      sort_order: i,
      is_active: true,
      call_status: "pending",
      created_at: now,
      updated_at: now,
    }));

    const chunk = 200;
    for (let i = 0; i < rowPayload.length; i += chunk) {
      const { error: rowsErr } = await db
        .from("campaign_audience_rows")
        .insert(rowPayload.slice(i, i + chunk));
      if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    const autoMap = autoMapCampaignColumns(
      parsed.headers,
      (campaign.trigger_rule as { type?: string })?.type === "excel_date"
    );

    const { data: updated, error: linkErr } = await db
      .from("voice_campaigns")
      .update({
        audience_table_id: table.id,
        field_mapping: {
          phone_column: autoMap.phone_column ?? "",
          name_column: autoMap.name_column ?? "",
          call_date_column: autoMap.call_date_column,
          custom_fields: autoMap.custom_fields,
        },
        wizard_step: Math.max(Number(campaign.wizard_step), 3),
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    return NextResponse.json({
      campaign: toVoiceCampaignRecord(updated),
      audience_table_id: table.id,
      row_count: parsed.rows.length,
      auto_map: autoMap,
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

  const columns = Array.isArray(table.columns) ? table.columns : [];
  const labels = columns.map((c: { label?: string }) => String(c.label ?? ""));
  const autoMap = autoMapCampaignColumns(
    labels,
    (campaign.trigger_rule as { type?: string })?.type === "excel_date"
  );

  const now = new Date().toISOString();
  const { data: updated, error: linkErr } = await db
    .from("voice_campaigns")
    .update({
      audience_table_id: audienceTableId,
      field_mapping: {
        phone_column: autoMap.phone_column ?? "",
        name_column: autoMap.name_column ?? "",
        call_date_column: autoMap.call_date_column,
        custom_fields: autoMap.custom_fields,
      },
      wizard_step: Math.max(Number(campaign.wizard_step), 3),
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({
    campaign: toVoiceCampaignRecord(updated),
    audience_table_id: audienceTableId,
    auto_map: autoMap,
  });
}
