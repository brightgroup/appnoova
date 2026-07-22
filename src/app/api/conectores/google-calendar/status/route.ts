import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getActiveCalendarConnection } from "@/lib/google-calendar/connections-db";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connection = await getActiveCalendarConnection(db, orgCtx.organizationId);

  return NextResponse.json({
    configured: isGoogleCalendarConfigured(),
    connection
  });
}
