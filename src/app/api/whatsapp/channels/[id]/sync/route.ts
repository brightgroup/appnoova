import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { getWhatsAppChannelById } from "@/lib/whatsapp-server";
import { syncTwilioWhatsAppChannel } from "@/lib/whatsapp/twilio-channel-sync";
import { textAgentsAdminClient } from "@/lib/text-agents-server";

/** POST — sincroniza estado Twilio (sender + webhooks) para líneas pendientes. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await params;
  const db = textAgentsAdminClient();

  const existing = await getWhatsAppChannelById(db, orgCtx.organizationId, id);
  if (!existing) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  try {
    const result = await syncTwilioWhatsAppChannel(db, id);
    const channel = await getWhatsAppChannelById(db, orgCtx.organizationId, id);
    return NextResponse.json({
      ...result,
      channel: channel ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al sincronizar" },
      { status: 500 }
    );
  }
}
