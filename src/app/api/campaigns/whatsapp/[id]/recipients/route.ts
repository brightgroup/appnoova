import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { getBroadcastCampaign } from "@/lib/campaigns-whatsapp/broadcast-db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgModule(req, "campaigns", "view");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const db = adminClient();
  const campaign = await getBroadcastCampaign(db, ctx.organizationId, id);
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const { data, error } = await db
    .from("whatsapp_broadcast_recipients")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recipients: data ?? [] });
}
