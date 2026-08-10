import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createConnection, listConnectionsForOrg } from "@/lib/automations/connections-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connections = await listConnectionsForOrg(db, orgCtx.organizationId);

  return NextResponse.json({ connections });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const webhookUrl = String(body?.webhookUrl ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Falta el nombre del conector" }, { status: 400 });
  }
  try {
    new URL(webhookUrl);
  } catch {
    return NextResponse.json({ error: "La URL del webhook no es válida" }, { status: 400 });
  }

  const db = adminClient();
  try {
    const { record, secret } = await createConnection(db, {
      organizationId: orgCtx.organizationId,
      connectedByUserId: orgCtx.userId,
      name,
      webhookUrl
    });
    return NextResponse.json({ connection: record, secret });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando el conector" },
      { status: 500 }
    );
  }
}
