import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { duplicateVoiceCampaign } from "@/lib/campaigns/duplicate-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

/** POST — duplica configuración de campaña (sin audiencia). Body opcional: { name } */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body opcional */
  }

  const db = adminClient();
  try {
    const campaign = await duplicateVoiceCampaign({
      db,
      sourceId: id,
      organizationId: auth.organizationId,
      userId: auth.userId,
      name: body.name,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al duplicar";
    const status = message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
