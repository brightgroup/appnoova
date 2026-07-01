import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { applyAudienceMapping } from "@/lib/campaigns/apply-mapping";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import type { CampaignFieldMapping, CampaignTriggerRule } from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await getOrgContextFromRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: {
    field_mapping?: CampaignFieldMapping;
    activate?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const mapping = body.field_mapping;
  if (!mapping?.phone_column || !mapping?.name_column) {
    return NextResponse.json(
      { error: "Teléfono y nombre son obligatorios en el mapeo" },
      { status: 400 }
    );
  }

  const db = adminClient();
  const { data: campaign, error } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (!campaign.audience_table_id) {
    return NextResponse.json({ error: "Primero conecta una audiencia" }, { status: 400 });
  }

  const trigger = (campaign.trigger_rule ?? {}) as CampaignTriggerRule;
  const stats = await applyAudienceMapping(
    db,
    campaign.audience_table_id,
    auth.organizationId,
    mapping,
    trigger
  );

  if (stats.updated === 0) {
    return NextResponse.json(
      { error: "Ninguna fila válida con teléfono y nombre. Revisa el mapeo." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await db
    .from("voice_campaigns")
    .update({
      field_mapping: mapping,
      wizard_step: 4,
      status: body.activate ? "active" : campaign.status,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    campaign: toVoiceCampaignRecord(updated),
    mapping_stats: stats,
  });
}
