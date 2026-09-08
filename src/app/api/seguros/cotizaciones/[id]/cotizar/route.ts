import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestById, markQuoteRequestQuoted } from "@/lib/insurers/quote-requests-db";
import { ejecutarCotizacionReal, type AutoQuoteVehicle } from "@/lib/insurers/auto-quote-tool";

type Ctx = { params: Promise<{ id: string }> };

/** El asesor humano solicita el precio real desde la plataforma — el "camino sin fricción" pedido explícitamente por el usuario. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const record = await getQuoteRequestById(db, orgCtx.organizationId, id);
  if (!record) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (record.estado !== "pendiente") {
    return NextResponse.json({ error: `Esta cotización ya está en estado "${record.estado}"` }, { status: 400 });
  }

  const { nombre_tomador, documento_tomador, fecha_nacimiento_tomador } = record.tomador;
  if (!nombre_tomador || !documento_tomador || !fecha_nacimiento_tomador) {
    return NextResponse.json({ error: "Faltan datos del tomador en esta solicitud" }, { status: 400 });
  }

  const resultado = await ejecutarCotizacionReal(
    { db, organizationId: orgCtx.organizationId },
    record.vehiculo as AutoQuoteVehicle,
    { nombre_tomador, documento_tomador, fecha_nacimiento_tomador }
  );

  if ("reason" in resultado) {
    return NextResponse.json({ error: resultado.reason }, { status: 502 });
  }

  await markQuoteRequestQuoted(db, record.id, {
    resultado: {
      aseguradora: resultado.aseguradora,
      prima: resultado.prima,
      vigencia_desde: resultado.vigencia_desde,
      vigencia_hasta: resultado.vigencia_hasta
    },
    quotedByUserId: orgCtx.userId
  });

  return NextResponse.json({ ok: true, resultado });
}
