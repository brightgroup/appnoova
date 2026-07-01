import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import {
  defaultFieldMapping,
  defaultScheduleConfig,
  defaultTriggerRule,
  toVoiceCampaignRecord,
} from "@/lib/campaigns/record";

export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data, error } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ campaigns: [], dbReady: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    campaigns: (data ?? []).map(r => toVoiceCampaignRecord(r)),
    dbReady: true,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: { name?: string; goal?: string; voice_agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = body.name?.trim();
  const voiceAgentId = body.voice_agent_id?.trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!voiceAgentId) return NextResponse.json({ error: "Agente de voz requerido" }, { status: 400 });

  const db = adminClient();
  const now = new Date().toISOString();

  const { data: agent, error: agentErr } = await db
    .from("voice_agents")
    .select("id")
    .eq("id", voiceAgentId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });

  const { data, error } = await db
    .from("voice_campaigns")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      name,
      goal: body.goal?.trim() || null,
      voice_agent_id: voiceAgentId,
      status: "draft",
      wizard_step: 1,
      schedule_config: defaultScheduleConfig(),
      trigger_rule: defaultTriggerRule(),
      field_mapping: defaultFieldMapping(),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: toVoiceCampaignRecord(data) });
}
