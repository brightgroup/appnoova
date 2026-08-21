import { NextRequest, NextResponse } from "next/server";
import { getMicrositePreviewForOrg } from "@/lib/microsite-server";
import { requireOrgModule } from "@/lib/module-auth";

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const id = req.nextUrl.searchParams.get("id") ?? undefined;
  const resolved = await getMicrositePreviewForOrg(orgCtx.organizationId, id);
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
