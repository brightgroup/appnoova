import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { slugifyStageName, toCrmStage } from "@/lib/crm-record";
import { getCrmStages } from "@/lib/crm-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const db = textAgentsAdminClient();
    const stages = await getCrmStages(db, userId);
    return NextResponse.json({ stages, dbReady: true });
  } catch (err) {
    if (isMissingTableError(err)) return NextResponse.json({ stages: [], dbReady: false }, { status: 503 });
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const stagesIn = Array.isArray(body.stages) ? body.stages : [];
  if (!stagesIn.length) return NextResponse.json({ error: "stages requerido" }, { status: 400 });

  const db = textAgentsAdminClient();
  const rows = stagesIn.map((s: Record<string, unknown>, i: number) => ({
    user_id: userId,
    name: String(s.name ?? "").trim(),
    slug: slugifyStageName(String(s.slug ?? s.name ?? `stage_${i}`)),
    color: String(s.color ?? "#5b5bf6"),
    sort_order: Number(s.sort_order ?? i),
    is_won: false,
    is_lost: false,
    ai_enter_criteria: s.ai_enter_criteria ? String(s.ai_enter_criteria).trim() : null,
    updated_at: new Date().toISOString()
  })).filter(r => r.name);

  await db.from("crm_pipeline_stages").delete().eq("user_id", userId);
  const { data, error } = await db.from("crm_pipeline_stages").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stages: (data ?? []).map(r => toCrmStage(r)) });
}
