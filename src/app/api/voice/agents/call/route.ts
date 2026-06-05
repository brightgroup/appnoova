import { NextRequest, NextResponse } from "next/server";
import { deriveQualityLabel } from "@/lib/voice-agent-display";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** POST { agent_id } — incrementa contador de llamadas del agente */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const agentId = body.agent_id as string;
  if (!agentId) {
    return NextResponse.json({ error: "agent_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: current, error: fetchErr } = await db
    .from("voice_agents")
    .select("calls_count")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const calls = (Number(current.calls_count) || 0) + 1;
  const quality_label = deriveQualityLabel(calls);

  const { data, error } = await db
    .from("voice_agents")
    .update({
      calls_count: calls,
      quality_label,
      updated_at: new Date().toISOString()
    })
    .eq("id", agentId)
    .eq("user_id", userId)
    .select("calls_count, quality_label")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    calls_count: data.calls_count,
    quality_label: data.quality_label
  });
}
