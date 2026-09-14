import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { updateInsurerConnectionRamos } from "@/lib/insurers/insurer-connections-db";

/** Guarda qué ramos (slugs de ramos_catalogo) cotiza esta aseguradora — alimenta quote-guidance.ts. */
export async function PATCH(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const ramos = Array.isArray(body?.ramos) ? body.ramos.filter((r: unknown) => typeof r === "string") : null;
  if (!ramos) {
    return NextResponse.json({ error: "ramos debe ser un arreglo de slugs" }, { status: 400 });
  }

  const db = adminClient();

  if (ramos.length > 0) {
    const { data: validRamos } = await db.from("ramos_catalogo").select("slug").in("slug", ramos);
    const validSlugs = new Set((validRamos ?? []).map(r => r.slug));
    const invalid = ramos.filter((r: string) => !validSlugs.has(r));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Ramo(s) desconocido(s): ${invalid.join(", ")}` }, { status: 400 });
    }
  }

  const connection = await updateInsurerConnectionRamos(db, orgCtx.organizationId, "la_equidad", ramos);
  if (!connection) {
    return NextResponse.json({ error: "La Equidad no está conectada todavía" }, { status: 404 });
  }
  return NextResponse.json({ connection });
}
