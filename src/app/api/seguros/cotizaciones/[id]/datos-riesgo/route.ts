import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { updateQuoteRequestDatos } from "@/lib/insurers/quote-requests-db";

type Ctx = { params: Promise<{ id: string }> };

/** El asesor completa a mano los campos del ramo (poliza_ramo_campos) o los datos personales del tomador — mismo insumo que si los hubiera capturado la IA por WhatsApp. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const campos = body.campos && typeof body.campos === "object" ? (body.campos as Record<string, unknown>) : undefined;
  const tomador = body.tomador && typeof body.tomador === "object" ? (body.tomador as Record<string, unknown>) : undefined;
  if (!campos && !tomador) {
    return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });
  }

  const db = adminClient();
  const updated = await updateQuoteRequestDatos(db, orgCtx.organizationId, id, { datosRiesgo: campos, tomador });
  if (!updated) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  return NextResponse.json({ quote: updated });
}
