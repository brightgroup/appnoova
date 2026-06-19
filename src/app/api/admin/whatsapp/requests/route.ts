import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — listar todas las solicitudes de WhatsApp. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const { data: rows, error } = await db
    .from("whatsapp_line_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const userIds = [...new Set(list.map(r => r.user_id))];
  const agentIds = [...new Set(list.map(r => r.text_agent_id).filter(Boolean))] as string[];

  const [profilesRes, agentsRes] = await Promise.all([
    userIds.length
      ? db.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; email: string; full_name: string | null }[] }),
    agentIds.length
      ? db.from("text_agents").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] })
  ]);

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p]));
  const agentMap = new Map((agentsRes.data ?? []).map(a => [a.id, a]));

  const requests = list.map(r => ({
    ...r,
    profiles: profileMap.get(r.user_id) ?? null,
    text_agents: r.text_agent_id ? agentMap.get(r.text_agent_id) ?? null : null
  }));

  return NextResponse.json({ requests });
}
