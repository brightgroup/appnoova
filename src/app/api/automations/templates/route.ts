import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";

/**
 * Plantillas de WhatsApp aprobadas/activas de todas las líneas de la
 * organización — usado por el picker del nodo "Enviar mensaje de WhatsApp"
 * (tipo Plantilla) en el editor de workflows. A diferencia de
 * /api/whatsapp/templates (scope por conversación o por usuario), este
 * endpoint no depende de una conversación concreta.
 */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "workflows", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();

  const { data: channels } = await db
    .from("whatsapp_channels")
    .select("id, friendly_name, e164")
    .eq("organization_id", orgCtx.organizationId);

  const channelIds = (channels ?? []).map(c => c.id as string);
  if (channelIds.length === 0) {
    return NextResponse.json({ templates: [] });
  }

  const { data, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .in("whatsapp_channel_id", channelIds)
    .in("status", ["approved", "active"])
    .order("template_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const channelLabelById = new Map(
    (channels ?? []).map(c => [c.id as string, (c.friendly_name as string | null) || (c.e164 as string)])
  );

  const templates = (data ?? []).map(row => {
    const record = toWhatsAppTemplateRecord(row);
    return { ...record, channel_label: channelLabelById.get(record.whatsapp_channel_id) ?? "" };
  });

  return NextResponse.json({ templates });
}
