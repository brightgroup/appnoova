import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById, getConnectionSecretsById } from "@/lib/automations/connections-db";

type Ctx = { params: Promise<{ id: string }> };

/** Revela el secreto en claro — gateado a "edit" (no "view") por ser sensible. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const connection = await getConnectionById(db, orgCtx.organizationId, id);
  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }

  const secrets = await getConnectionSecretsById(db, id);
  if (!secrets) {
    return NextResponse.json({ error: "No se pudo leer el secreto" }, { status: 500 });
  }

  return NextResponse.json({ secret: secrets.secret });
}
