import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — listar todas las solicitudes de WhatsApp. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const { data, error } = await db
    .from("whatsapp_line_requests")
    .select(`
      *,
      profiles(email, full_name),
      text_agents(name)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}
