import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toCrmLead } from "@/lib/crm-record";
import { buildLeadRowFromBody } from "@/lib/crm-lead-payload";
import { DEFAULT_PROXIMA_ACCION } from "@/lib/crm-lead-utils";
import { getCrmStages } from "@/lib/crm-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? null;
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
    current_user_name: user ? userDisplayName(user) : "Usuario",
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

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const { row, error: buildError } = buildLeadRowFromBody(
    {
      ...body,
      title,
      stage_id: stageId,
      proxima_accion: body.proxima_accion ?? DEFAULT_PROXIMA_ACCION,
      proxima_accion_fecha: body.proxima_accion_fecha ?? tomorrow.toISOString(),
      proxima_accion_estado: body.proxima_accion_estado ?? "pendiente",
      outcome: body.outcome ?? "open"
    },
    { isCreate: true }
  );
  if (buildError) return NextResponse.json({ error: buildError }, { status: 400 });

  const { count } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage_id", stageId);

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crm_leads")
    .insert({
      user_id: userId,
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
