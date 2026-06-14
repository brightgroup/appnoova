import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toCrmLead } from "@/lib/crm-record";
import { getCrmStages } from "@/lib/crm-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = textAgentsAdminClient();
  try {
    await getCrmStages(db, userId);
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ leads: [], stages: [], dbReady: false }, { status: 503 });
    }
  }

  const [leadsRes, stages] = await Promise.all([
    db
      .from("crm_leads")
      .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
      .eq("user_id", userId)
      .order("sort_order"),
    getCrmStages(db, userId)
  ]);

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  return NextResponse.json({
    leads: (leadsRes.data ?? []).map(r => toCrmLead(r as Record<string, unknown>)),
    stages,
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title es requerido" }, { status: 400 });

  const db = textAgentsAdminClient();
  const stages = await getCrmStages(db, userId);
  const stageId = body.stage_id ? String(body.stage_id) : stages[0]?.id;
  if (!stageId) return NextResponse.json({ error: "Sin etapas configuradas" }, { status: 400 });

  const { count } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage_id", stageId);

  const { data, error } = await db
    .from("crm_leads")
    .insert({
      user_id: userId,
      stage_id: stageId,
      contact_id: body.contact_id ? String(body.contact_id) : null,
      title,
      value_amount: body.value_amount != null ? Number(body.value_amount) : null,
      currency: String(body.currency ?? "COP"),
      source: body.source ? String(body.source).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      sort_order: count ?? 0
    })
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: toCrmLead(data as Record<string, unknown>) });
}
