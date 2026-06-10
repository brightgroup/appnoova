import { NextRequest, NextResponse } from "next/server";
import { getPublishedMicrositeBySlug } from "@/lib/microsite-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const resolved = await getPublishedMicrositeBySlug(slug);

  if (!resolved) {
    return NextResponse.json({ error: "Micrositio no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ config: resolved.config });
}
