import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { getCrmStages } from "@/lib/crm-server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reassignToStageId =
    typeof body.reassign_to_stage_id === "string" && body.reassign_to_stage_id
      ? body.reassign_to_stage_id
      : null;

  const db = textAgentsAdminClient();

  const { data: stageRow, error: stageError } = await db
    .from("crm_pipeline_stages")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (stageError) return NextResponse.json({ error: stageError.message }, { status: 500 });
  if (!stageRow) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });

  const { count: activeStageCount, error: countError } = await db
    .from("crm_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_won", false)
    .eq("is_lost", false);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((activeStageCount ?? 0) <= 2) {
    return NextResponse.json(
      { error: "Debes mantener al menos dos etapas en el pipeline." },
      { status: 400 }
    );
  }

  const { count: leadCount, error: leadCountError } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage_id", id);
  if (leadCountError) return NextResponse.json({ error: leadCountError.message }, { status: 500 });

  if ((leadCount ?? 0) > 0 && !reassignToStageId) {
    return NextResponse.json(
      { error: "Esta etapa tiene leads asignados.", lead_count: leadCount },
      { status: 409 }
    );
  }

  if ((leadCount ?? 0) > 0 && reassignToStageId) {
    if (reassignToStageId === id) {
      return NextResponse.json({ error: "Elige una etapa destino distinta." }, { status: 400 });
    }
    const { data: targetRow, error: targetError } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("id", reassignToStageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
    if (!targetRow) return NextResponse.json({ error: "Etapa destino no encontrada" }, { status: 404 });

    const { error: reassignError } = await db
      .from("crm_leads")
      .update({ stage_id: reassignToStageId, stage_entered_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("stage_id", id);
    if (reassignError) return NextResponse.json({ error: reassignError.message }, { status: 500 });
  }

  const { error: deleteError } = await db
    .from("crm_pipeline_stages")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const stages = await getCrmStages(db, userId);
  return NextResponse.json({ stages });
}
