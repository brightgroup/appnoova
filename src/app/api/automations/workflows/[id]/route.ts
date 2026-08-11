import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import {
  getWorkflowById,
  setWorkflowStatus,
  updateWorkflowGraph,
  renameWorkflow,
  deleteWorkflow
} from "@/lib/automations/workflows-db";
import { normalizeWorkflowGraph } from "@/lib/automations/node-types";

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
  return NextResponse.json({ workflow });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "workflows", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  let workflow = await getWorkflowById(db, orgCtx.organizationId, id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
  }

  if (body?.graph !== undefined) {
    workflow = await updateWorkflowGraph(db, orgCtx.organizationId, id, normalizeWorkflowGraph(body.graph));
  }
  if (body?.status === "active" || body?.status === "paused") {
    workflow = await setWorkflowStatus(db, orgCtx.organizationId, id, body.status);
  }
  if (typeof body?.name === "string" && body.name.trim()) {
    workflow = await renameWorkflow(db, orgCtx.organizationId, id, body.name.trim());
  }

  return NextResponse.json({ workflow });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "workflows", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const workflow = await getWorkflowById(db, orgCtx.organizationId, id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
  }

  const ok = await deleteWorkflow(db, orgCtx.organizationId, id);
  if (!ok) {
    return NextResponse.json({ error: "No se pudo eliminar el workflow" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
