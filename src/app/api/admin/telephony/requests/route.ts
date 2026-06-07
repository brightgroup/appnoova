import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import type { PhoneLineRequestAdminRow, PhoneLineRequestStatus } from "@/types/phone-line-request";

const VALID_STATUS = new Set<PhoneLineRequestStatus>([
  "pending",
  "in_progress",
  "completed",
  "rejected"
]);

/** GET — todas las solicitudes de clientes (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const status = new URL(req.url).searchParams.get("status");
  const db = adminClient();

  let query = db
    .from("phone_line_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data: requests, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = requests ?? [];
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const agentIds = [...new Set(rows.map(r => r.voice_agent_id).filter(Boolean))] as string[];

  const [usersRes, agentsRes] = await Promise.all([
    userIds.length
      ? db.from("users").select("id, email, nombre").in("id", userIds)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? db.from("voice_agents").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] })
  ]);

  const userMap = new Map((usersRes.data ?? []).map(u => [u.id, u]));
  const agentMap = new Map((agentsRes.data ?? []).map(a => [a.id, a.name]));

  const enriched: PhoneLineRequestAdminRow[] = rows.map(r => {
    const user = userMap.get(r.user_id);
    return {
      ...r,
      client_name: user?.nombre ?? null,
      client_email: user?.email ?? null,
      agent_name: r.voice_agent_id ? agentMap.get(r.voice_agent_id) ?? null : null
    };
  });

  const pending_count = enriched.filter(r => r.status === "pending").length;

  return NextResponse.json({ requests: enriched, pending_count });
}

/** PATCH — actualizar estado. Body: { id, status } */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, status } = body as { id?: string; status?: PhoneLineRequestStatus };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  if (!status || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("phone_line_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}
