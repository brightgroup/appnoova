import { NextRequest, NextResponse } from "next/server";
import { getMicrositePreviewForUser } from "@/lib/microsite-server";
import { getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const resolved = await getMicrositePreviewForUser(userId);
  if (!resolved) {
    return NextResponse.json(
      { error: "Asigna un agente de texto para generar la vista previa." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    config: resolved.config,
    slug: resolved.microsite.slug,
    is_published: resolved.microsite.is_published
  });
}
