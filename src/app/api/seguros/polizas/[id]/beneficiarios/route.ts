import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getPolizaById } from "@/lib/insurers/polizas-db";
import { createBeneficiario, listBeneficiarios } from "@/lib/insurers/poliza-beneficiarios-db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  const poliza = await getPolizaById(db, ctx.crmUserId, id);
  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada" }, { status: 404 });

  const beneficiarios = await listBeneficiarios(db, id);
  return NextResponse.json({ beneficiarios });
}

export async function POST(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  const poliza = await getPolizaById(db, ctx.crmUserId, id);
  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  try {
    const beneficiario = await createBeneficiario(db, id, {
      nombre,
      documento: body.documento || null,
      parentesco: body.parentesco || null,
      porcentajeBeneficio: body.porcentaje_beneficio !== undefined && body.porcentaje_beneficio !== "" ? Number(body.porcentaje_beneficio) : null
    });
    return NextResponse.json({ beneficiario });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo crear el beneficiario" }, { status: 500 });
  }
}
