import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestById, markQuoteRequestQuoted } from "@/lib/insurers/quote-requests-db";

type Ctx = { params: Promise<{ id: string }> };

/** El asesor registra manualmente el precio que ya cotizó por fuera (ramos sin conector de aseguradora: vida, hogar, etc.). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const prima = typeof body.prima === "number" && body.prima > 0 ? body.prima : null;
  const aseguradora = typeof body.aseguradora === "string" ? body.aseguradora.trim() : "";
  if (!prima) return NextResponse.json({ error: "Falta la prima (debe ser un número mayor a 0)." }, { status: 400 });

  const db = adminClient();
  const record = await getQuoteRequestById(db, orgCtx.organizationId, id);
  if (!record) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (record.estado !== "pendiente") {
    return NextResponse.json({ error: `Esta cotización ya está en estado "${record.estado}"` }, { status: 400 });
  }

  await markQuoteRequestQuoted(db, record.id, {
    resultado: { aseguradora: aseguradora || undefined, prima },
    quotedByUserId: orgCtx.userId
  });

  return NextResponse.json({ ok: true });
}
