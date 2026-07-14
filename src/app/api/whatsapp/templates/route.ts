import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";
import {
  createWhatsAppTemplate,
  PMV_BROKER_TEMPLATE_PRESETS
} from "@/lib/whatsapp/template-server";
import { syncPendingWhatsAppTemplates } from "@/lib/whatsapp/template-sync";
import { requireOrgModule } from "@/lib/module-auth";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";

/** GET: inbox (conversation_id) o gestión (whatsapp_channel_id / listado). POST: crear plantilla. */
export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  const channelId = req.nextUrl.searchParams.get("whatsapp_channel_id");

  if (conversationId) {
    const orgCtx = await requireOrgModule(req, "inbox", "view");
    if (orgCtx instanceof NextResponse) return orgCtx;

    // Traer aprobaciones de Twilio antes de listar (si sigue en pending en BD).
    await syncPendingWhatsAppTemplates(db);

    const belongs = await conversationBelongsToOrg(db, conversationId, orgCtx.organizationId);
    if (!belongs) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const { data: conv, error: convErr } = await db
      .from("text_agent_conversations")
      .select("channel, metadata, user_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
      return NextResponse.json({ templates: [] });
    }

    const meta = (conv.metadata ?? {}) as Record<string, unknown>;
    const waChannelId = meta.whatsapp_channel_id ? String(meta.whatsapp_channel_id) : "";
    if (!waChannelId) return NextResponse.json({ templates: [] });

    const { data: channel } = await db
      .from("whatsapp_channels")
      .select("id, organization_id")
      .eq("id", waChannelId)
      .maybeSingle();

    if (
      !channel ||
      (channel.organization_id && String(channel.organization_id) !== orgCtx.organizationId)
    ) {
      return NextResponse.json({ templates: [] });
    }

    // Plantillas de la línea (canal), no del usuario actual — el inbox es org-scoped.
    const { data, error } = await db
      .from("whatsapp_templates")
      .select("*")
      .eq("whatsapp_channel_id", waChannelId)
      .in("status", ["approved", "active"])
      .order("template_name");

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ templates: [], dbReady: false }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      templates: (data ?? []).map(row => toWhatsAppTemplateRecord(row)),
      dbReady: true
    });
  }

  await syncPendingWhatsAppTemplates(db);

  let query = db
    .from("whatsapp_templates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (channelId) query = query.eq("whatsapp_channel_id", channelId);

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ templates: [], presets: PMV_BROKER_TEMPLATE_PRESETS, dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: (data ?? []).map(row => toWhatsAppTemplateRecord(row)),
    presets: PMV_BROKER_TEMPLATE_PRESETS,
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const action = String(body.action ?? "draft").trim() === "submit" ? "submit" : "draft";

  const db = textAgentsAdminClient();
  const result = await createWhatsAppTemplate({ db, userId, body, action });

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ template: result.template });
}

export async function DELETE(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = textAgentsAdminClient();
  const { error } = await db.from("whatsapp_templates").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
