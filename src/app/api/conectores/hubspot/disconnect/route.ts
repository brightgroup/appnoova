import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { disconnectHubspotConnection } from "@/lib/hubspot/connections-db";

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  await disconnectHubspotConnection(db, orgCtx.organizationId);

  return NextResponse.json({ ok: true });
}
