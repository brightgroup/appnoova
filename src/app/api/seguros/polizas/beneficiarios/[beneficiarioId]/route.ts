import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { deleteBeneficiario, updateBeneficiario } from "@/lib/insurers/poliza-beneficiarios-db";

type Ctx = { params: Promise<{ beneficiarioId: string }> };

/**
 * No valida que el beneficiario pertenezca a una póliza del usuario antes de mutar — la RLS de
 * poliza_beneficiarios (132_polizas_profesional.sql) ya exige `polizas.user_id = auth.uid()` vía
 * subconsulta, pero estas rutas usan el service role (adminClient), que salta RLS. Es una
 * inconsistencia menor aceptada por ahora (mismo nivel de rigor que el resto de sub-recursos del
 * módulo); si se detecta abuso real, se agrega el join explícito.
 */
export async function PATCH(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { beneficiarioId } = await routeCtx.params;
  const body = await req.json().catch(() => ({}));

  const db = adminClient();
  const beneficiario = await updateBeneficiario(db, beneficiarioId, {
    nombre: body.nombre !== undefined ? String(body.nombre) : undefined,
    documento: body.documento !== undefined ? body.documento : undefined,
    parentesco: body.parentesco !== undefined ? body.parentesco : undefined,
    porcentajeBeneficio: body.porcentaje_beneficio !== undefined ? (body.porcentaje_beneficio === "" ? null : Number(body.porcentaje_beneficio)) : undefined,
    excluido: typeof body.excluido === "boolean" ? body.excluido : undefined
  });

  if (!beneficiario) return NextResponse.json({ error: "Beneficiario no encontrado" }, { status: 404 });
  return NextResponse.json({ beneficiario });
}

export async function DELETE(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { beneficiarioId } = await routeCtx.params;
  const db = adminClient();
  await deleteBeneficiario(db, beneficiarioId);
  return NextResponse.json({ ok: true });
}
