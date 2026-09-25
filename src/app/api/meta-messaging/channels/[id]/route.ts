import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { decryptToken } from "@/lib/crypto/token-cipher";
import { unsubscribePageFromApp } from "@/lib/meta-messaging/connect";
import { toPublicMetaMessagingChannel } from "@/lib/meta-messaging/channel-public";
import type { MetaMessagingChannelRecord } from "@/lib/meta-messaging/types";

type Params = { params: Promise<{ id: string }> };

async function loadChannel(organizationId: string, id: string) {
  const db = textAgentsAdminClient();
  const { data } = await db
    .from("meta_messaging_channels")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .neq("status", "disconnected")
    .maybeSingle();
  return { db, channel: (data as MetaMessagingChannelRecord | null) ?? null };
}

/** PATCH — cambia el agente que atiende el canal. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await params;
  const { db, channel } = await loadChannel(orgCtx.organizationId, id);
  if (!channel) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });

  let body: { text_agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.text_agent_id) return NextResponse.json({ error: "text_agent_id requerido" }, { status: 400 });

  const { data: agent } = await db
    .from("text_agents")
    .select("id")
    .eq("id", body.text_agent_id)
    .eq("organization_id", orgCtx.organizationId)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agente no encontrado en tu organización" }, { status: 404 });

  const { data, error } = await db
    .from("meta_messaging_channels")
    .update({ text_agent_id: body.text_agent_id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ channel: toPublicMetaMessagingChannel(data as MetaMessagingChannelRecord) });
}

/**
 * DELETE — desconecta el canal. Las conversaciones se conservan en el inbox.
 * Si era el último canal activo de esa página, se quita también la suscripción
 * de la app a la página en Meta.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await params;
  const { db, channel } = await loadChannel(orgCtx.organizationId, id);
  if (!channel) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });

  const { error } = await db
    .from("meta_messaging_channels")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await db
    .from("meta_messaging_channels")
    .select("id", { count: "exact", head: true })
    .eq("page_id", channel.page_id)
    .neq("status", "disconnected");

  if (!count) {
    try {
      await unsubscribePageFromApp(channel.page_id, decryptToken(channel.page_access_token_enc));
    } catch (err) {
      console.warn("[meta-messaging] desconectar:", err);
    }
  }

  return NextResponse.json({ success: true });
}
