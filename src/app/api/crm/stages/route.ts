import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { slugifyStageName, toCrmStage } from "@/lib/crm-record";
import { getCrmStages } from "@/lib/crm-server";

export async function GET(req: NextRequest) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

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

export async function POST(req: NextRequest) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });

  const db = textAgentsAdminClient();

  const { count, error: countError } = await db
    .from("crm_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  const { error: insertError } = await db.from("crm_pipeline_stages").insert({
    user_id: userId,
    name,
    slug: slugifyStageName(String(body.slug ?? name)),
    color: String(body.color ?? "#5b5bf6"),
    sort_order: count ?? 0,
    is_won: false,
    is_lost: false,
    ai_enter_criteria: body.ai_enter_criteria ? String(body.ai_enter_criteria).trim() : null
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const stages = await getCrmStages(db, userId);
  return NextResponse.json({ stages });
}

export async function PUT(req: NextRequest) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const body = await req.json();
  const stagesIn = Array.isArray(body.stages) ? body.stages : [];
  if (!stagesIn.length) return NextResponse.json({ error: "stages requerido" }, { status: 400 });

  const db = textAgentsAdminClient();

  const { data: existingRows, error: fetchError } = await db
    .from("crm_pipeline_stages")
    .select("id")
    .eq("user_id", userId);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  const existingIds = new Set((existingRows ?? []).map(r => String(r.id)));

  const rows = stagesIn.map((s: Record<string, unknown>, i: number) => ({
    id: typeof s.id === "string" && existingIds.has(s.id) ? s.id : undefined,
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

  const toUpdate = rows.filter(r => r.id);
  const toInsert = rows.filter(r => !r.id).map(({ id: _id, ...r }) => r);

  const keepIds = new Set(toUpdate.map(r => r.id));
  const toDeleteIds = [...existingIds].filter(id => !keepIds.has(id));

  if (toDeleteIds.length) {
    const { error: deleteError } = await db
      .from("crm_pipeline_stages")
      .delete()
      .in("id", toDeleteIds)
      .eq("user_id", userId);
    if (deleteError) {
      if (deleteError.code === "23503") {
        return NextResponse.json(
          { error: "No se pueden eliminar una o más etapas porque tienen leads asignados. Mueve esos leads a otra etapa primero." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  if (toUpdate.length) {
    const { error: updateError } = await db
      .from("crm_pipeline_stages")
      .upsert(toUpdate, { onConflict: "id" });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (toInsert.length) {
    const { error: insertError } = await db.from("crm_pipeline_stages").insert(toInsert);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: finalRows, error: finalError } = await db
    .from("crm_pipeline_stages")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 });

  return NextResponse.json({
    stages: (finalRows ?? []).map(r => toCrmStage(r)).filter(s => !s.is_won && !s.is_lost)
  });
}
