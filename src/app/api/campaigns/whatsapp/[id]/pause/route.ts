import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { getBroadcastCampaign, updateCampaignStatus } from "@/lib/campaigns-whatsapp/broadcast-db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();
  const campaign = await getBroadcastCampaign(db, ctx.organizationId, id);
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  await updateCampaignStatus(db, ctx.organizationId, id, "pausada");
  return NextResponse.json({ ok: true });
}
