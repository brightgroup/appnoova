import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import {
  ORI_ORG_INSTRUCCIONES_MAX,
  getOriOrgInstructions,
  normalizeOriOrgInstructions,
  saveOriOrgInstructions
} from "@/lib/ori/ori-prompt-settings";

/**
 * Instrucciones de Ori que configura el propio cliente. Se gatean con el módulo
 * `company_context` a propósito: es el mismo permiso que ya decide quién puede
 * cambiar cómo se le habla a la IA, así ninguna organización necesita un rol
 * nuevo para usar esto.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "company_context", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const config = await getOriOrgInstructions(db, ctx.organizationId);
  return NextResponse.json({ config, max_length: ORI_ORG_INSTRUCCIONES_MAX });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireOrgModule(req, "company_context", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const next = normalizeOriOrgInstructions({
    instrucciones: body.instrucciones,
    tono: body.tono,
    extension: body.extension,
    filasPorConsulta: body.filas_por_consulta ?? body.filasPorConsulta
  });

  const db = adminClient();
  try {
    const config = await saveOriOrgInstructions(db, ctx.organizationId, next, ctx.userId);
    return NextResponse.json({ config, max_length: ORI_ORG_INSTRUCCIONES_MAX });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al guardar" }, { status: 500 });
  }
}
