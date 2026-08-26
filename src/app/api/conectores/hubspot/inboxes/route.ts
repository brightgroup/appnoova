import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getActiveHubspotConnectionSecrets } from "@/lib/hubspot/connections-db";
import { listInboxes } from "@/lib/hubspot/conversations";

/** Bandejas del portal conectado — alimenta el selector "¿de qué bandeja escuchar?" del nodo trigger de HubSpot en el editor de workflows. */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connection = await getActiveHubspotConnectionSecrets(db, orgCtx.organizationId);
  if (!connection) {
    return NextResponse.json({ inboxes: [] });
  }

  try {
    const inboxes = await listInboxes(db, connection);
    return NextResponse.json({ inboxes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudieron traer las bandejas de HubSpot", inboxes: [] },
      { status: 502 }
    );
  }
}
