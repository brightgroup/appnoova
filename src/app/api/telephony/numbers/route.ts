import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — números del usuario autenticado. ?agent_id= opcional */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get("agent_id");
  const db = adminClient();

  let query = db
    .from("phone_numbers")
    .select("id, e164, friendly_name, country_code, number_type, status, voice_agent_id, capabilities, assigned_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false });

  if (agentId) query = query.eq("voice_agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ phone_numbers: data ?? [] });
}
