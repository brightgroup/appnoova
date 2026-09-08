import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getRenovacionRule, upsertRenovacionRule } from "@/lib/insurers/renovacion-rules-db";

export async function GET(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const rule = await getRenovacionRule(db, ctx.organizationId);
  return NextResponse.json({ rule });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const db = adminClient();

  if (body.hora_envio !== undefined) {
    const hora = Number(body.hora_envio);
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
      return NextResponse.json({ error: "hora_envio debe estar entre 0 y 23" }, { status: 400 });
    }
  }
  if (body.dias_aviso !== undefined) {
    if (!Array.isArray(body.dias_aviso) || body.dias_aviso.some((d: unknown) => !Number.isInteger(d) || Number(d) < 0)) {
      return NextResponse.json({ error: "dias_aviso debe ser una lista de enteros no negativos" }, { status: 400 });
    }
  }

  try {
    const rule = await upsertRenovacionRule(db, ctx.organizationId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      horaEnvio: body.hora_envio !== undefined ? Number(body.hora_envio) : undefined,
      diasAviso: Array.isArray(body.dias_aviso) ? body.dias_aviso.map(Number) : undefined,
      whatsappChannelId: body.whatsapp_channel_id !== undefined ? body.whatsapp_channel_id || null : undefined,
      templateId: body.template_id !== undefined ? body.template_id || null : undefined,
      escalarALlamada: typeof body.escalar_a_llamada === "boolean" ? body.escalar_a_llamada : undefined
    });
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al guardar" }, { status: 500 });
  }
}
