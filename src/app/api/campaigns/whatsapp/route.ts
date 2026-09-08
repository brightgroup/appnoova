import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import {
  createBroadcastCampaign,
  listBroadcastCampaigns,
  countRecipientsByEstado
} from "@/lib/campaigns-whatsapp/broadcast-db";

export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "campaigns", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const campaigns = await listBroadcastCampaigns(db, ctx.organizationId);
  const withCounts = await Promise.all(
    campaigns.map(async campaign => ({
      campaign,
      counts: await countRecipientsByEstado(db, campaign.id)
    }))
  );
  return NextResponse.json({ campaigns: withCounts, dbReady: true });
}

interface RecipientInput {
  contact_id?: string | null;
  contact_name?: string | null;
  phone_e164: string;
  variable_values?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const whatsappChannelId = String(body.whatsapp_channel_id ?? "").trim();
  const templateId = String(body.template_id ?? "").trim();
  const recipientsInput = Array.isArray(body.recipients) ? (body.recipients as RecipientInput[]) : [];

  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!whatsappChannelId) return NextResponse.json({ error: "Canal de WhatsApp requerido" }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: "Plantilla requerida" }, { status: 400 });
  if (recipientsInput.length === 0) {
    return NextResponse.json({ error: "Debes incluir al menos un destinatario" }, { status: 400 });
  }

  const db = adminClient();

  const { data: channel, error: channelErr } = await db
    .from("whatsapp_channels")
    .select("id, organization_id")
    .eq("id", whatsappChannelId)
    .maybeSingle();
  if (channelErr) return NextResponse.json({ error: channelErr.message }, { status: 500 });
  if (!channel || String(channel.organization_id) !== ctx.organizationId) {
    return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
  }

  const { data: template, error: templateErr } = await db
    .from("whatsapp_templates")
    .select("id, twilio_content_sid, status")
    .eq("id", templateId)
    .eq("whatsapp_channel_id", whatsappChannelId)
    .maybeSingle();
  if (templateErr) return NextResponse.json({ error: templateErr.message }, { status: 500 });
  if (!template) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  if (!template.twilio_content_sid || !["approved", "active"].includes(String(template.status))) {
    return NextResponse.json({ error: "La plantilla debe estar aprobada antes de usarla en una campaña" }, { status: 400 });
  }

  const recipients = recipientsInput
    .map(r => ({
      contactId: r.contact_id ?? null,
      contactName: r.contact_name ?? null,
      phoneE164: String(r.phone_e164 ?? "").trim(),
      variableValues: r.variable_values ?? {}
    }))
    .filter(r => r.phoneE164.length > 0);

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Ningún destinatario tiene teléfono válido" }, { status: 400 });
  }

  const campaign = await createBroadcastCampaign(db, {
    organizationId: ctx.organizationId,
    name,
    whatsappChannelId,
    templateId,
    createdByUserId: ctx.userId,
    recipients
  });

  return NextResponse.json({ campaign });
}
