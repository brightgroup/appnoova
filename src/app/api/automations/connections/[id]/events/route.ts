import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById } from "@/lib/automations/connections-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const connection = await getConnectionById(db, orgCtx.organizationId, id);
  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }

  const { data } = await db
    .from("automation_event_log")
    .select("*")
    .eq("connection_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ events: data ?? [] });
}
