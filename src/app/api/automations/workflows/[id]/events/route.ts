import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getWorkflowById } from "@/lib/automations/workflows-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "workflows", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const workflow = await getWorkflowById(db, orgCtx.organizationId, id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
  }

  const { data } = await db
    .from("automation_event_log")
    .select("*")
    .eq("workflow_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ events: data ?? [] });
}
