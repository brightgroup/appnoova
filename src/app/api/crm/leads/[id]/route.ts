import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { toCrmLead } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

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
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.stage_id !== undefined) updates.stage_id = String(body.stage_id);
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.contact_id !== undefined) updates.contact_id = body.contact_id ? String(body.contact_id) : null;
  if (body.value_amount !== undefined) updates.value_amount = body.value_amount != null ? Number(body.value_amount) : null;
  if (body.source !== undefined) updates.source = body.source ? String(body.source).trim() : null;
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
  if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
  if (body.currency !== undefined) updates.currency = String(body.currency ?? "COP");
  if (body.outcome !== undefined) {
    const o = String(body.outcome);
    if (o === "won" || o === "lost" || o === "open") updates.outcome = o;
  }

  const db = textAgentsAdminClient();

  if (body.metadata !== undefined && typeof body.metadata === "object" && body.metadata !== null) {
    const { data: existing } = await db
      .from("crm_leads")
      .select("metadata")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    const prev = (existing?.metadata as Record<string, unknown>) ?? {};
    updates.metadata = { ...prev, ...(body.metadata as Record<string, unknown>) };
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
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { error } = await db.from("crm_leads").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
