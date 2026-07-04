import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST — reinicia contactos para una nueva ronda.
 * Requiere campaña pausada o finalizada (no activa).
 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(_req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data: campaign, error } = await db
    .from("voice_campaigns")
    .select("id, status, audience_table_id")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (!campaign.audience_table_id) {
    return NextResponse.json({ error: "La campaña no tiene audiencia" }, { status: 400 });
  }
  if (campaign.status === "active") {
    return NextResponse.json(
      {
        error: "Pausa la campaña antes de reiniciar los contactos.",
        code: "campaign_active",
      },
      { status: 400 }
    );
  }
  if (campaign.status === "draft") {
    return NextResponse.json(
      {
        error: "Activa la campaña primero; los contactos ya están en pendiente.",
        code: "campaign_draft",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { data: rows, error: rowsErr } = await db
    .from("campaign_audience_rows")
    .select("id")
    .eq("audience_table_id", campaign.audience_table_id)
    .eq("is_active", true);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  let updated = 0;
  for (const row of rows ?? []) {
    const { error: upErr } = await db
      .from("campaign_audience_rows")
      .update({
        call_status: "pending",
        total_attempts: 0,
        last_attempt_at: null,
        scheduled_call_at: now,
        updated_at: now,
      })
      .eq("id", row.id);

    if (!upErr) updated += 1;
  }

  const { data: refreshed, error: campErr } = await db
    .from("voice_campaigns")
    .update({
      status: "paused",
      completed_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    reset_rows: updated,
    campaign: toVoiceCampaignRecord(refreshed),
    message: `${updated} contacto(s) listos para marcar. Reanuda la campaña cuando quieras iniciar la nueva ronda.`,
  });
}
