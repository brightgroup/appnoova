import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { toCrmLead } from "@/lib/crm-record";
import { buildLeadRowFromBody, validateLeadPatch } from "@/lib/crm-lead-payload";
import type { CrmLeadOutcome, CrmMotivoPerdida } from "@/types/crm";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("crm_leads")
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  return NextResponse.json({ lead: toCrmLead(data as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const body = await req.json();
  const db = textAgentsAdminClient();

  const { data: existing, error: fetchErr } = await db
    .from("crm_leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const { row, error: buildError } = buildLeadRowFromBody(body, {
    previousStageId: String(existing.stage_id)
  });
  if (buildError) return NextResponse.json({ error: buildError }, { status: 400 });

  const mergedOutcome = (row.outcome ?? existing.outcome ?? "open") as CrmLeadOutcome;
  const patchError = validateLeadPatch({
    outcome: mergedOutcome,
    contact_id:
      row.contact_id !== undefined
        ? (row.contact_id as string | null)
        : existing.contact_id
          ? String(existing.contact_id)
          : null,
    motivo_perdida:
      row.motivo_perdida !== undefined
        ? (row.motivo_perdida as CrmMotivoPerdida | null)
        : existing.motivo_perdida
          ? (existing.motivo_perdida as CrmMotivoPerdida)
          : null
  });
  if (patchError) return NextResponse.json({ error: patchError }, { status: 400 });

  const updates: Record<string, unknown> = {
    ...row,
    updated_at: new Date().toISOString()
  };

  if (body.metadata !== undefined && typeof body.metadata === "object" && body.metadata !== null) {
    const prev = (existing.metadata as Record<string, unknown>) ?? {};
    updates.metadata = { ...prev, ...(body.metadata as Record<string, unknown>) };
  }

  if (body.field_provenance !== undefined && typeof body.field_provenance === "object") {
    const prev = (existing.field_provenance as Record<string, unknown>) ?? {};
    updates.field_provenance = { ...prev, ...(body.field_provenance as Record<string, unknown>) };
  }

  const { data, error } = await db
    .from("crm_leads")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  return NextResponse.json({ lead: toCrmLead(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { error } = await db.from("crm_leads").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
