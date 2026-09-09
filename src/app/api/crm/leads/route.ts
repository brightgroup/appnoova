import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmLeadVisibility } from "@/lib/crm-auth";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toCrmLead } from "@/lib/crm-record";
import { buildLeadRowFromBody } from "@/lib/crm-lead-payload";
import { getCrmStages } from "@/lib/crm-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";

export async function GET(req: NextRequest) {
  const visibility = await getCrmLeadVisibility(req, "view");
  if (visibility instanceof NextResponse) return visibility;
  const { tenantUserId, callerUserId, canManageAll } = visibility;

  const db = textAgentsAdminClient();
  try {
    await getCrmStages(db, tenantUserId);
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ leads: [], stages: [], dbReady: false }, { status: 503 });
    }
  }

  let leadsQuery = db
    .from("crm_leads")
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .eq("user_id", tenantUserId)
    .order("sort_order");
  if (!canManageAll) leadsQuery = leadsQuery.eq("assigned_user_id", callerUserId);

  const [leadsRes, stages] = await Promise.all([leadsQuery, getCrmStages(db, tenantUserId)]);

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  const user = await getAuthUserFromRequest(req);
  return NextResponse.json({
    leads: (leadsRes.data ?? []).map(r => toCrmLead(r as Record<string, unknown>)),
    stages,
    current_user_name: user ? userDisplayName(user) : "Usuario",
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const visibility = await getCrmLeadVisibility(req, "edit");
  if (visibility instanceof NextResponse) return visibility;
  const { tenantUserId, callerUserId, canManageAll } = visibility;

  const body = await req.json();
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title es requerido" }, { status: 400 });

  const db = textAgentsAdminClient();
  const stages = await getCrmStages(db, tenantUserId);
  const stageId = body.stage_id ? String(body.stage_id) : stages[0]?.id;
  if (!stageId) return NextResponse.json({ error: "Sin etapas configuradas" }, { status: 400 });

  const { row, error: buildError } = buildLeadRowFromBody(
    {
      ...body,
      title,
      stage_id: stageId,
      outcome: body.outcome ?? "open"
    },
    { isCreate: true }
  );
  if (buildError) return NextResponse.json({ error: buildError }, { status: 400 });

  const { count } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tenantUserId)
    .eq("stage_id", stageId);

  // Un asesor sin nivel manage siempre queda dueño de lo que él mismo crea —
  // si además pide un dueño/admin, el lead nace sin asignar hasta que lo reparta.
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crm_leads")
    .insert({
      user_id: tenantUserId,
      assigned_user_id: canManageAll ? null : callerUserId,
      stage_id: stageId,
      title,
      sort_order: count ?? 0,
      stage_entered_at: now,
      ...row
    })
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: toCrmLead(data as Record<string, unknown>) });
}
