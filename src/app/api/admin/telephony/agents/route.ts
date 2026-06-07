import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — agentes de voz de un usuario (para asignar línea). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id requerido" }, { status: 400 });

  const db = adminClient();
  const { data, error } = await db
    .from("voice_agents")
    .select("id, name, template_id, status")
    .eq("user_id", userId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data ?? [] });
}
