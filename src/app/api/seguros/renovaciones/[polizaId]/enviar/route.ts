import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getPolizaById } from "@/lib/insurers/polizas-db";
import { getRenovacionRule } from "@/lib/insurers/renovacion-rules-db";
import { enviarAvisoPoliza } from "@/lib/insurers/renovacion-engine";

type Ctx = { params: Promise<{ polizaId: string }> };

/** POST — botón "Enviar aviso ahora": dispara un hito puntual sin esperar al cron. */
export async function POST(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { polizaId } = await routeCtx.params;
  const body = await req.json().catch(() => ({}));
  const diasAviso = Number(body.dias_aviso);
  if (!Number.isInteger(diasAviso) || diasAviso < 0) {
    return NextResponse.json({ error: "dias_aviso inválido" }, { status: 400 });
  }

  const db = adminClient();
  const poliza = await getPolizaById(db, ctx.crmUserId, polizaId);
  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada" }, { status: 404 });

  const rule = await getRenovacionRule(db, ctx.organizationId);
  if (!rule.whatsappChannelId || !rule.templateId) {
    return NextResponse.json({ error: "Configura primero el canal y la plantilla de renovaciones" }, { status: 400 });
  }

  const [{ data: channelRow }, { data: templateRow }] = await Promise.all([
    db.from("whatsapp_channels").select("*").eq("id", rule.whatsappChannelId).maybeSingle(),
    db.from("whatsapp_templates").select("*").eq("id", rule.templateId).maybeSingle()
  ]);
  if (!channelRow || !templateRow) {
    return NextResponse.json({ error: "Canal o plantilla configurados ya no existen" }, { status: 400 });
  }

  const result = await enviarAvisoPoliza(db, {
    organizationId: ctx.organizationId,
    poliza,
    diasAviso,
    channelRow,
    templateRow
  });

  if (result.estado === "enviado") return NextResponse.json({ ok: true });

  const MENSAJES: Record<string, string> = {
    omitido_optout: "El contacto pidió no recibir WhatsApp.",
    sin_telefono: "El contacto no tiene un teléfono válido.",
    bloqueado_billing: "Facturación bloqueada para esta organización.",
    plantilla_no_lista: "La plantilla configurada no está aprobada todavía.",
    fallido: "error" in result ? result.error : "No se pudo enviar."
  };
  return NextResponse.json({ error: MENSAJES[result.estado] ?? "No se pudo enviar" }, { status: 400 });
}
