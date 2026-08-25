import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getInventoryAlertRule, upsertInventoryAlertRule, type InventoryAlertMode } from "@/lib/erp/alert-rules-db";

const VALID_MODES = new Set<InventoryAlertMode>(["al_cruzar", "resumen_diario", "ambos"]);

export async function GET(req: NextRequest) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const rule = await getInventoryAlertRule(db, ctx.organizationId);
  return NextResponse.json({ rule });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  if (body.modo !== undefined && !VALID_MODES.has(body.modo)) {
    return NextResponse.json({ error: "modo inválido" }, { status: 400 });
  }
  if (body.hora_resumen !== undefined) {
    const hora = Number(body.hora_resumen);
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
      return NextResponse.json({ error: "hora_resumen debe estar entre 0 y 23" }, { status: 400 });
    }
  }

  try {
    const rule = await upsertInventoryAlertRule(db, ctx.organizationId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      canalEmail: typeof body.canal_email === "boolean" ? body.canal_email : undefined,
      destinatarios: Array.isArray(body.destinatarios) ? body.destinatarios.map(String) : undefined,
      modo: body.modo,
      horaResumen: body.hora_resumen !== undefined ? Number(body.hora_resumen) : undefined
    });
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al guardar" }, { status: 500 });
  }
}
