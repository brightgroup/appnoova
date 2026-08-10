import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById, regenerateSecret } from "@/lib/automations/connections-db";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const connection = await getConnectionById(db, orgCtx.organizationId, id);
  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }

  const secret = await regenerateSecret(db, orgCtx.organizationId, id);
  return NextResponse.json({ secret });
}
