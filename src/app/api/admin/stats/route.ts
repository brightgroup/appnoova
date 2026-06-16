import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatDuration(sec: number): string {
  if (sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** GET — métricas agregadas para el panel /admin */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const todayStart = startOfUtcDay();

  async function count(table: string, eq?: { column: string; value: string }) {
    try {
      let q = db.from(table).select("*", { count: "exact", head: true });
      if (eq) q = q.eq(eq.column, eq.value);
      const { count: n, error } = await q;
      if (error) return 0;
      return n ?? 0;
    } catch {
      return 0;
    }
  }

  const [
    usersTotal,
    usersActive,
    orgsTotal,
    orgsActive,
    pendingRequests,
    phoneLines,
    waChannels,
    waPending,
    voiceAgents,
    textAgents,
    callsTodayRes,
  ] = await Promise.all([
    count("profiles"),
    count("profiles", { column: "status", value: "active" }),
    count("organizations"),
    count("organizations", { column: "status", value: "active" }),
    count("phone_line_requests", { column: "status", value: "pending" }),
    count("phone_numbers"),
    count("whatsapp_channels"),
    count("whatsapp_templates", { column: "status", value: "pending_approval" }),
    count("voice_agents"),
    count("text_agents"),
    db.from("voice_agent_calls").select("duration_sec").gte("created_at", todayStart).limit(500),
  ]);

  const callsToday = callsTodayRes.error ? [] : (callsTodayRes.data ?? []);
  const callsTodayCount = callsToday.length;
  const avgDurationSec =
    callsTodayCount > 0
      ? Math.round(callsToday.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0) / callsTodayCount)
      : 0;

  return NextResponse.json({
    users_total: usersTotal,
    users_active: usersActive,
    organizations_total: orgsTotal,
    organizations_active: orgsActive,
    pending_telephony_requests: pendingRequests,
    phone_lines_total: phoneLines,
    whatsapp_channels_total: waChannels,
    pending_whatsapp_templates: waPending,
    voice_agents_total: voiceAgents,
    text_agents_total: textAgents,
    calls_today: callsTodayCount,
    avg_call_duration_sec: avgDurationSec,
    avg_call_duration_label: formatDuration(avgDurationSec),
  });
}
