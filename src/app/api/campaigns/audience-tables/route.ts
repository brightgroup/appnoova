import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { toAudienceTableRecord } from "@/lib/campaigns/record";

/** GET — tablas de audiencia de la organización */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data, error } = await db
    .from("campaign_audience_tables")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ tables: [], dbReady: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tables: (data ?? []).map(r => toAudienceTableRecord(r)),
    dbReady: true,
  });
}
