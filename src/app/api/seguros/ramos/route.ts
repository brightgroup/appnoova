import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";

/** GET ?q= — búsqueda del catálogo estándar de ramos (ramos_catalogo, global, sembrado en 130_ramos_catalogo.sql). */
export async function GET(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const db = adminClient();

  let query = db.from("ramos_catalogo").select("id, nombre, slug").eq("activo", true).order("nombre").limit(q ? 20 : 200);
  if (q) query = query.ilike("nombre", `%${q}%`);

  const { data } = await query;
  return NextResponse.json({ ramos: data ?? [] });
}
