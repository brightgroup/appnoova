import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — roles asignables en la organización (sin owner) */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req, { module: "org_users", minLevel: "view" });
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data: roles, error } = await db
    .from("roles")
    .select("id, slug, name, description, is_system")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .neq("slug", "owner")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: roles ?? [] });
}
