import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { getBroadcastCampaign, countRecipientsByEstado } from "@/lib/campaigns-whatsapp/broadcast-db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgModule(req, "campaigns", "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();
  const campaign = await getBroadcastCampaign(db, ctx.organizationId, id);
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const counts = await countRecipientsByEstado(db, campaign.id);
  return NextResponse.json({ campaign, counts });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();
  const campaign = await getBroadcastCampaign(db, ctx.organizationId, id);
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (campaign.status === "enviando") {
    return NextResponse.json({ error: "Pausa la campaña antes de eliminarla" }, { status: 400 });
  }

  await db.from("whatsapp_broadcast_campaigns").delete().eq("id", id).eq("organization_id", ctx.organizationId);
  return NextResponse.json({ ok: true });
}
