import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createWorkflow, listWorkflowsForOrg } from "@/lib/automations/workflows-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "workflows", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const workflows = await listWorkflowsForOrg(db, orgCtx.organizationId);

  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "workflows", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim() || "Nuevo workflow";

  const db = adminClient();
  try {
    const workflow = await createWorkflow(db, orgCtx.organizationId, orgCtx.userId, name);
    return NextResponse.json({ workflow });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando el workflow" },
      { status: 500 }
    );
  }
}
