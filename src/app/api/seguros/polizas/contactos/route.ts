import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Búsqueda liviana de contactos para el selector de tomador del modal de
 * pólizas — no depende del módulo "crm" (permiso propio), solo de "seguros",
 * porque un usuario puede tener seguros sin necesariamente tener acceso al
 * CRM completo.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const db = adminClient();

  let query = db
    .from("crm_contacts")
    .select("id, name, telefono, whatsapp, documento_id")
    .eq("user_id", ctx.crmUserId)
    .order("name", { ascending: true })
    .limit(20);

  if (q) query = query.or(`name.ilike.%${q}%,documento_id.ilike.%${q}%,telefono.ilike.%${q}%`);

  const { data } = await query;
  return NextResponse.json({ contactos: data ?? [] });
}
