import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import type {
  CampaignFieldMapping,
  CampaignScheduleConfig,
  CampaignTriggerRule,
} from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadCampaign(id: string, organizationId: string, userId: string) {
  const db = adminClient();
  const { data, error } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await getOrgContextFromRequest(_req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const row = await loadCampaign(id, auth.organizationId, auth.userId);
    if (!row) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    return NextResponse.json({ campaign: toVoiceCampaignRecord(row) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await getOrgContextFromRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: {
    name?: string;
    goal?: string | null;
    voice_agent_id?: string;
    wizard_step?: number;
    schedule_config?: CampaignScheduleConfig;
    trigger_rule?: CampaignTriggerRule;
    field_mapping?: CampaignFieldMapping;
    status?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await loadCampaign(id, auth.organizationId, auth.userId);
  if (!existing) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.goal !== undefined) patch.goal = body.goal?.trim() || null;
  if (body.voice_agent_id !== undefined) patch.voice_agent_id = body.voice_agent_id;
  if (body.wizard_step !== undefined) patch.wizard_step = body.wizard_step;
  if (body.schedule_config !== undefined) patch.schedule_config = body.schedule_config;
  if (body.trigger_rule !== undefined) patch.trigger_rule = body.trigger_rule;
  if (body.field_mapping !== undefined) patch.field_mapping = body.field_mapping;
  if (body.status !== undefined) patch.status = body.status;

  const db = adminClient();
  const { data, error } = await db
    .from("voice_campaigns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: toVoiceCampaignRecord(data) });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const auth = await getOrgContextFromRequest(_req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const existing = await loadCampaign(id, auth.organizationId, auth.userId);
  if (!existing) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const db = adminClient();
  const { error } = await db.from("voice_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
