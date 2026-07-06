import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import {
  computeScheduledCallAt,
  extractRowContactFields,
  applyContactFieldsToRowData,
} from "@/lib/campaigns/audience-rows";
import { toE164 } from "@/lib/telephony/e164";
import type { DataTableColumn } from "@/types/data-table";
import type {
  CampaignAudienceStats,
  CampaignCallStatus,
  CampaignFieldMapping,
  CampaignTriggerRule,
} from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

type RowData = Record<string, string | number | boolean | null>;

async function loadCampaignForEdit(
  db: ReturnType<typeof adminClient>,
  id: string,
  organizationId: string
) {
  const { data: campaign } = await db
    .from("voice_campaigns")
    .select("id, audience_table_id, field_mapping, trigger_rule")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!campaign?.audience_table_id) return null;

  const { data: table } = await db
    .from("campaign_audience_tables")
    .select("columns, row_count")
    .eq("id", campaign.audience_table_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return {
    audienceTableId: campaign.audience_table_id as string,
    mapping: (campaign.field_mapping ?? {}) as CampaignFieldMapping,
    trigger: (campaign.trigger_rule ?? { type: "on_activate" }) as CampaignTriggerRule,
    columns: (Array.isArray(table?.columns) ? table.columns : []) as DataTableColumn[],
    rowCount: Number(table?.row_count ?? 0),
  };
}

function deriveRowFields(
  data: RowData,
  mapping: CampaignFieldMapping,
  trigger: CampaignTriggerRule,
  columns: DataTableColumn[]
) {
  const { phone_e164, contact_name } = extractRowContactFields(data, mapping, columns);
  const scheduled = computeScheduledCallAt(data, mapping, trigger);
  return {
    phone_e164,
    contact_name,
    scheduled_call_at: scheduled?.toISOString() ?? null,
  };
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data: campaign, error: campErr } = await db
    .from("voice_campaigns")
    .select("id, audience_table_id")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (!campaign.audience_table_id) {
    return NextResponse.json({ table: null, rows: [], stats: emptyStats() });
  }

  const { data: table, error: tableErr } = await db
    .from("campaign_audience_tables")
    .select("*")
    .eq("id", campaign.audience_table_id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (tableErr) return NextResponse.json({ error: tableErr.message }, { status: 500 });
  if (!table) return NextResponse.json({ table: null, rows: [], stats: emptyStats() });

  const { data: rows, error: rowsErr } = await db
    .from("campaign_audience_rows")
    .select(
      "id, data, phone_e164, contact_name, scheduled_call_at, call_status, total_attempts, last_attempt_at, sort_order, is_active, crm_contact_id, crm_lead_id, results, results_meta, result_primary, excluded_reason"
    )
    .eq("audience_table_id", campaign.audience_table_id)
    .eq("organization_id", auth.organizationId)
    .order("sort_order", { ascending: true });

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const list = rows ?? [];
  const stats = computeStats(list.map(r => r.call_status as CampaignCallStatus));

  return NextResponse.json({
    table: {
      id: table.id,
      name: table.name,
      columns: (Array.isArray(table.columns) ? table.columns : []) as DataTableColumn[],
      row_count: table.row_count,
      source_file_name: table.source_file_name,
    },
    rows: list,
    stats,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const rowId = String(body.row_id ?? "");
  if (!rowId) return NextResponse.json({ error: "row_id requerido" }, { status: 400 });

  const db = adminClient();
  const meta = await loadCampaignForEdit(db, id, auth.organizationId);
  if (!meta) return NextResponse.json({ error: "Campaña sin audiencia" }, { status: 404 });

  const { data: existingRow } = await db
    .from("campaign_audience_rows")
    .select("data")
    .eq("id", rowId)
    .eq("audience_table_id", meta.audienceTableId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (!existingRow) return NextResponse.json({ error: "Fila no encontrada" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  let data =
    body.data && typeof body.data === "object"
      ? (body.data as RowData)
      : ({ ...(existingRow.data as RowData) } as RowData);

  if (typeof body.contact_name === "string" || body.contact_name === null) {
    data = applyContactFieldsToRowData(data, meta.mapping, {
      contact_name: body.contact_name as string | null,
    });
  }
  if (typeof body.phone_e164 === "string" || body.phone_e164 === null) {
    const raw = body.phone_e164 == null ? null : String(body.phone_e164).trim();
    const normalized = raw ? toE164(raw) || raw : null;
    data = applyContactFieldsToRowData(data, meta.mapping, {
      phone_e164: normalized,
    });
  }

  if (
    body.data ||
    typeof body.contact_name === "string" ||
    body.contact_name === null ||
    typeof body.phone_e164 === "string" ||
    body.phone_e164 === null
  ) {
    patch.data = data;
    const derived = deriveRowFields(data, meta.mapping, meta.trigger, meta.columns);
    patch.phone_e164 = derived.phone_e164;
    patch.contact_name = derived.contact_name;
    patch.scheduled_call_at = derived.scheduled_call_at;
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.call_status === "string") patch.call_status = body.call_status;

  const { data: updated, error } = await db
    .from("campaign_audience_rows")
    .update(patch)
    .eq("id", rowId)
    .eq("audience_table_id", meta.audienceTableId)
    .eq("organization_id", auth.organizationId)
    .select(
      "id, data, phone_e164, contact_name, scheduled_call_at, call_status, total_attempts, last_attempt_at, sort_order, is_active, crm_contact_id, crm_lead_id, results, results_meta, result_primary, excluded_reason"
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Fila no encontrada" }, { status: 404 });
  return NextResponse.json({ row: updated });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data = (body.data ?? {}) as RowData;

  let contactName =
    typeof body.contact_name === "string" ? body.contact_name.trim() : undefined;
  let phoneRaw =
    typeof body.phone_e164 === "string" ? body.phone_e164.trim() : undefined;

  const db = adminClient();
  const meta = await loadCampaignForEdit(db, id, auth.organizationId);
  if (!meta) return NextResponse.json({ error: "Campaña sin audiencia" }, { status: 404 });

  let rowData = data;
  if (contactName !== undefined || phoneRaw !== undefined) {
    rowData = applyContactFieldsToRowData(rowData, meta.mapping, {
      ...(contactName !== undefined ? { contact_name: contactName || null } : {}),
      ...(phoneRaw !== undefined
        ? { phone_e164: phoneRaw ? toE164(phoneRaw) || phoneRaw : null }
        : {}),
    });
  }

  const derived = deriveRowFields(rowData, meta.mapping, meta.trigger, meta.columns);
  const now = new Date().toISOString();

  const { data: inserted, error } = await db
    .from("campaign_audience_rows")
    .insert({
      audience_table_id: meta.audienceTableId,
      organization_id: auth.organizationId,
      data: rowData,
      phone_e164: derived.phone_e164,
      contact_name: derived.contact_name,
      scheduled_call_at: derived.scheduled_call_at,
      call_status: "pending",
      sort_order: meta.rowCount,
      updated_at: now,
    })
    .select(
      "id, data, phone_e164, contact_name, scheduled_call_at, call_status, total_attempts, last_attempt_at, sort_order, is_active, crm_contact_id, crm_lead_id, results, results_meta, result_primary, excluded_reason"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("campaign_audience_tables")
    .update({ row_count: meta.rowCount + 1, updated_at: now })
    .eq("id", meta.audienceTableId);

  return NextResponse.json({ row: inserted });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const rowId = req.nextUrl.searchParams.get("row_id");
  if (!rowId) return NextResponse.json({ error: "row_id requerido" }, { status: 400 });

  const db = adminClient();
  const meta = await loadCampaignForEdit(db, id, auth.organizationId);
  if (!meta) return NextResponse.json({ error: "Campaña sin audiencia" }, { status: 404 });

  const { error } = await db
    .from("campaign_audience_rows")
    .delete()
    .eq("id", rowId)
    .eq("audience_table_id", meta.audienceTableId)
    .eq("organization_id", auth.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("campaign_audience_tables")
    .update({
      row_count: Math.max(0, meta.rowCount - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("id", meta.audienceTableId);

  return NextResponse.json({ ok: true });
}

function emptyStats(): CampaignAudienceStats {
  return {
    total_contacts: 0,
    called: 0,
    connected: 0,
    voicemail: 0,
    no_answer: 0,
    busy: 0,
    rejected: 0,
    failed: 0,
    pending: 0,
    connection_rate: 0,
  };
}

function computeStats(statuses: CampaignCallStatus[]): CampaignAudienceStats {
  const total = statuses.length;
  const connected = statuses.filter(s => s === "connected").length;
  const voicemail = statuses.filter(s => s === "voicemail").length;
  const no_answer = statuses.filter(s => s === "no_answer").length;
  const busy = statuses.filter(s => s === "busy").length;
  const rejected = statuses.filter(s => s === "rejected").length;
  const failed = statuses.filter(s => s === "failed").length;
  const pending = statuses.filter(s => s === "pending" || s === "retry" || s === "calling").length;
  const called = statuses.filter(s => s !== "pending" && s !== "skipped").length;

  return {
    total_contacts: total,
    called,
    connected,
    voicemail,
    no_answer,
    busy,
    rejected,
    failed,
    pending,
    connection_rate: total > 0 ? Math.round((connected / total) * 100) : 0,
  };
}
