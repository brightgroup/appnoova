import { NextRequest, NextResponse } from "next/server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { canDeleteWhatsAppChannel } from "@/lib/whatsapp/channel-status";
import { getWhatsAppChannelById } from "@/lib/whatsapp-server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const db = textAgentsAdminClient();
  const channel = await getWhatsAppChannelById(db, userId, id);

  if (!channel) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ channel, dbReady: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const db = textAgentsAdminClient();

  const existing = await getWhatsAppChannelById(db, userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (body.text_agent_id !== undefined) {
    const agentId = body.text_agent_id ? String(body.text_agent_id) : null;
    if (agentId) {
      const { data: agent } = await db
        .from("text_agents")
        .select("id")
        .eq("id", agentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!agent) {
        return NextResponse.json({ error: "Agente de texto no encontrado" }, { status: 400 });
      }
    }
    updates.text_agent_id = agentId;
  }

  if (body.friendly_name !== undefined) {
    updates.friendly_name = body.friendly_name ? String(body.friendly_name).trim() : null;
  }

  if (body.action === "disconnect") {
    const now = new Date().toISOString();
    const priorMeta =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    updates.status = "suspended";
    updates.meta_access_token = null;
    updates.metadata = {
      ...priorMeta,
      disconnected_at: now,
      disconnected_by: "user"
    };
  }

  const { data, error } = await db
    .from("whatsapp_channels")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta 021_whatsapp_channels.sql en Supabase" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel: toWhatsAppChannelRecord(data!) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const db = textAgentsAdminClient();

  const existing = await getWhatsAppChannelById(db, userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  if (!canDeleteWhatsAppChannel(existing)) {
    return NextResponse.json(
      { error: "Desconecta la línea antes de eliminarla" },
      { status: 409 }
    );
  }

  const { error } = await db.from("whatsapp_channels").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta 021_whatsapp_channels.sql en Supabase" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
