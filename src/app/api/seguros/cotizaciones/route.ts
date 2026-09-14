import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { listQuoteRequests, upsertPendingQuoteRequest, type QuoteRequestEstado } from "@/lib/insurers/quote-requests-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const estado = req.nextUrl.searchParams.get("estado") as QuoteRequestEstado | null;
  const db = adminClient();
  const requests = await listQuoteRequests(db, orgCtx.organizationId, estado ? { estado } : undefined);

  return NextResponse.json({ requests });
}

/** Creación manual desde la plataforma — "Nueva solicitud" en Solicitudes y "Nueva cotización" en Cotizaciones. */
export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => null);
  if (!body?.ramo || !body?.tomador?.nombre_tomador || !body?.tomador?.documento_tomador) {
    return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
  }

  const db = adminClient();
  const record = await upsertPendingQuoteRequest(db, {
    organizationId: orgCtx.organizationId,
    source: "manual",
    ramo: body.ramo,
    placa: body.placa || null,
    vehiculo: body.vehiculo || {},
    datosRiesgo: body.datosRiesgo || {},
    tomador: body.tomador
  });

  return NextResponse.json({ request: record });
}
