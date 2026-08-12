import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById, updateConnectionWebhookUrl } from "@/lib/automations/connections-db";

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
  return NextResponse.json({ connection });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const webhookUrl = body?.webhookUrl !== undefined ? String(body.webhookUrl).trim() : undefined;

  if (!webhookUrl) {
    return NextResponse.json({ error: "Falta la URL del webhook" }, { status: 400 });
  }
  try {
    new URL(webhookUrl);
  } catch {
    return NextResponse.json({ error: "La URL del webhook no es válida" }, { status: 400 });
  }

  const db = adminClient();
  const connection = await updateConnectionWebhookUrl(db, orgCtx.organizationId, id, webhookUrl);
  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ connection });
}
