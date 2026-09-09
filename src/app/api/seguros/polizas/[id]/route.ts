import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { deletePoliza, getPolizaById, updatePoliza } from "@/lib/insurers/polizas-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  const poliza = await getPolizaById(db, ctx.crmUserId, id);
  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada" }, { status: 404 });

  return NextResponse.json({ poliza });
}

export async function PATCH(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  const poliza = await updatePoliza(db, ctx.crmUserId, id, {
    aseguradora: body.aseguradora !== undefined ? String(body.aseguradora) : undefined,
    ramo: body.ramo !== undefined ? String(body.ramo) : undefined,
    ramoId: body.ramo_id !== undefined ? body.ramo_id : undefined,
    numeroPoliza: body.numero_poliza !== undefined ? body.numero_poliza : undefined,
    vigenciaDesde: body.vigencia_desde !== undefined ? body.vigencia_desde : undefined,
    vigenciaHasta: body.vigencia_hasta !== undefined ? body.vigencia_hasta : undefined,
    prima: body.prima !== undefined ? (body.prima === "" || body.prima === null ? null : Number(body.prima)) : undefined,
    periodicidadPago: body.periodicidad_pago !== undefined ? body.periodicidad_pago : undefined,
    estado: body.estado !== undefined ? body.estado : undefined,
    tipoPoliza: body.tipo_poliza !== undefined ? body.tipo_poliza : undefined,
    moneda: body.moneda !== undefined ? body.moneda : undefined
  });

  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada" }, { status: 404 });
  return NextResponse.json({ poliza });
}

export async function DELETE(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  await deletePoliza(db, ctx.crmUserId, id);
  return NextResponse.json({ ok: true });
}
