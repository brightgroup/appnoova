import { NextRequest, NextResponse } from "next/server";
import {
  filterInboxItems,
  formatInboxDisplayTitle,
  inboxDetailChannelLabel,
  sortInboxItems,
  textRowToInboxItem
} from "@/lib/inbox-utils";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase-table-error";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";
import type { InboxDetail, InboxFilter } from "@/types/inbox";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import {
  readWhatsAppMeta,
  whatsAppComplianceNotice
} from "@/lib/whatsapp/compliance";
import {
  isWhatsAppSessionOpen,
  whatsAppSessionExpiresAt
} from "@/lib/whatsapp/session-window";
import { signWhatsAppMessageMedia } from "@/lib/whatsapp/media-storage";
import { requireOrgModule } from "@/lib/module-auth";
import {
  conversationBelongsToOrg,
  getOrgTextAgentIds,
  loadOrgTextAgentNames
} from "@/lib/inbox-org-scope";
import type { WhatsAppTemplateVariableContext } from "@/lib/whatsapp/template-variable-context";

function looksLikePhone(value: string): boolean {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+?\d{10,15}$/.test(compact);
}

async function buildTemplateContext(input: {
  db: ReturnType<typeof textAgentsAdminClient>;
  organizationId: string;
  metadata: Record<string, unknown>;
  contactLabel: string;
  displayTitle: string;
}): Promise<WhatsAppTemplateVariableContext> {
  const phone =
    (input.metadata.whatsapp_contact_e164
      ? String(input.metadata.whatsapp_contact_e164).trim()
      : "") ||
    (looksLikePhone(input.contactLabel) ? input.contactLabel.trim() : "");

  let contactName = "";
  const titleName = input.displayTitle.split(" · ")[0]?.trim() || "";
  if (titleName && !looksLikePhone(titleName) && titleName !== "WhatsApp") {
    contactName = titleName;
  } else if (input.contactLabel && !looksLikePhone(input.contactLabel)) {
    contactName = input.contactLabel.trim();
  }

  let companyName = "";
  let email = "";
  let city = "";

  const crmContactId = input.metadata.crm_contact_id
    ? String(input.metadata.crm_contact_id).trim()
    : "";

  if (crmContactId) {
    const { data: contact } = await input.db
      .from("crm_contacts")
      .select("name, organizacion, company, email, ciudad, whatsapp, telefono")
      .eq("id", crmContactId)
      .maybeSingle();
    if (contact) {
      if (contact.name?.trim()) contactName = String(contact.name).trim();
      companyName = String(contact.organizacion ?? contact.company ?? "").trim();
      email = String(contact.email ?? "").trim();
      city = String(contact.ciudad ?? "").trim();
    }
  }

  if (!companyName) {
    const { data: org } = await input.db
      .from("organizations")
      .select("name")
      .eq("id", input.organizationId)
      .maybeSingle();
    if (org?.name?.trim()) companyName = String(org.name).trim();
  }

  return {
    contact_name: contactName || null,
    company_name: companyName || null,
    phone: phone || null,
    email: email || null,
    city: city || null
  };
}

function parseFilter(raw: string | null): InboxFilter {
  if (raw === "mine" || raw === "unassigned" || raw === "archived") return raw;
  return "all";
}

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "inbox", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? orgCtx.userId;
  const db = textAgentsAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const currentUserName = user ? userDisplayName(user) : "Usuario";
  const agentIds = await getOrgTextAgentIds(db, orgCtx.organizationId);

  if (!agentIds.length) {
    if (id) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    return NextResponse.json({
      items: [],
      current_user_name: currentUserName,
      dbReady: true
    });
  }

  if (id) {
    const belongs = await conversationBelongsToOrg(db, id, orgCtx.organizationId);
    if (!belongs) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const { data, error } = await db
      .from("text_agent_conversations")
      .select("*")
      .eq("id", id)
      .in("text_agent_id", agentIds)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ detail: null, dbReady: false });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    const record = toTextConversationRecord(data);
    const textNames = await loadOrgTextAgentNames(db, orgCtx.organizationId);
    const { data: agentRow } = await db
      .from("text_agents")
      .select("human_only")
      .eq("id", record.text_agent_id)
      .maybeSingle();
    const agentHumanOnly = agentRow?.human_only === true;
    const isWhatsApp = record.channel === WHATSAPP_CONVERSATION_CHANNEL;
    const waMeta = readWhatsAppMeta(record.metadata, record.messages);
    const mediaOwnerId = String(data.user_id ?? userId);
    const messagesWithMedia = isWhatsApp
      ? await signWhatsAppMessageMedia(db, mediaOwnerId, record.messages)
      : record.messages;
    const displayTitle = formatInboxDisplayTitle(
      record.contact_label,
      record.channel,
      record.id,
      record.metadata
    );
    const detail: InboxDetail = {
      kind: "text",
      id: record.id,
      contact_label: record.contact_label,
      display_title: displayTitle,
      channel: record.channel,
      channel_label: inboxDetailChannelLabel(record.channel),
      agent_id: record.text_agent_id,
      agent_name: textNames[record.text_agent_id] ?? String(record.metadata.agent_name ?? "Agente"),
      assigned_to: record.assigned_to,
      handoff_mode: record.handoff_mode,
      agent_human_only: agentHumanOnly,
      unread_count: record.unread_count,
      status: record.status,
      messages: messagesWithMedia,
      created_at: record.created_at,
      updated_at: record.updated_at,
      archived_at: record.archived_at,
      ...(isWhatsApp
        ? {
            whatsapp_session_open: isWhatsAppSessionOpen(waMeta.lastInboundAt),
            whatsapp_session_expires_at: whatsAppSessionExpiresAt(waMeta.lastInboundAt),
            whatsapp_opted_out: waMeta.optedOut,
            whatsapp_compliance_notice: whatsAppComplianceNotice(record.metadata, record.messages),
            template_context: await buildTemplateContext({
              db,
              organizationId: orgCtx.organizationId,
              metadata: record.metadata,
              contactLabel: record.contact_label,
              displayTitle
            })
          }
        : {})
    };

    await db
      .from("text_agent_conversations")
      .update({ unread_count: 0 })
      .eq("id", id)
      .in("text_agent_id", agentIds);

    return NextResponse.json({
      detail: { ...detail, unread_count: 0 },
      current_user_name: currentUserName,
      dbReady: true
    });
  }

  const textNames = await loadOrgTextAgentNames(db, orgCtx.organizationId);

  const listSelectWithArchive =
    "id, text_agent_id, channel, contact_label, messages_count, status, assigned_to, handoff_mode, unread_count, messages, summary, created_at, updated_at, archived_at";
  const listSelectWithHandoff =
    "id, text_agent_id, channel, contact_label, messages_count, status, assigned_to, handoff_mode, unread_count, messages, summary, created_at, updated_at";
  const listSelectLegacy =
    "id, text_agent_id, channel, contact_label, messages_count, status, messages, summary, created_at, updated_at";

  const textResArchive = await db
    .from("text_agent_conversations")
    .select(listSelectWithArchive)
    .in("text_agent_id", agentIds)
    .order("updated_at", { ascending: false })
    .limit(200);

  const textResPrimary =
    textResArchive.error && isMissingColumnError(textResArchive.error)
      ? await db
          .from("text_agent_conversations")
          .select(listSelectWithHandoff)
          .in("text_agent_id", agentIds)
          .order("updated_at", { ascending: false })
          .limit(200)
      : textResArchive;

  const textRes =
    textResPrimary.error && isMissingColumnError(textResPrimary.error)
      ? await db
          .from("text_agent_conversations")
          .select(listSelectLegacy)
          .in("text_agent_id", agentIds)
          .order("updated_at", { ascending: false })
          .limit(200)
      : textResPrimary;

  if (textRes.error && !isMissingTableError(textRes.error)) {
    return NextResponse.json({ error: textRes.error.message }, { status: 500 });
  }

  const textItems = (textRes.data ?? []).map(row =>
    textRowToInboxItem(row, textNames[String(row.text_agent_id)] ?? "Agente")
  );

  const items = filterInboxItems(sortInboxItems(textItems), filter, currentUserName);

  return NextResponse.json({
    items,
    current_user_name: currentUserName,
    dbReady: textRes.error ? false : true
  });
}

export async function PATCH(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "inbox", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? orgCtx.userId;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const belongs = await conversationBelongsToOrg(db, conversationId, orgCtx.organizationId);
  if (!belongs) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  if (typeof body.archived === "boolean") {
    const agentIds = await getOrgTextAgentIds(db, orgCtx.organizationId);
    const { data, error } = await db
      .from("text_agent_conversations")
      .update({
        archived_at: body.archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .in("text_agent_id", agentIds)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return NextResponse.json({ error: "Ejecuta la migración 097_inbox_archive en Supabase" }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const record = toTextConversationRecord(data);
    return NextResponse.json({
      conversation: record,
      can_reply: record.handoff_mode === "human" && Boolean(record.assigned_to)
    });
  }

  const assignTo = body.assign_to as string | null | undefined;
  const currentUserName = user ? userDisplayName(user) : "Usuario";

  let assignedTo: string | null = null;
  let handoffMode: "ai" | "human" = "ai";
  let statusLabel = "Chat activo";

  if (assignTo === "ai" || assignTo === null || assignTo === "") {
    assignedTo = null;
    handoffMode = "ai";
    statusLabel = "Chat activo";
  } else if (assignTo === "human" || assignTo === "me") {
    assignedTo = currentUserName;
    handoffMode = "human";
    statusLabel = "Atendido por humano";
  } else {
    assignedTo = String(assignTo).trim();
    handoffMode = "human";
    statusLabel = "Atendido por humano";
  }

  const agentIds = await getOrgTextAgentIds(db, orgCtx.organizationId);

  if (handoffMode === "ai") {
    const { data: conv } = await db
      .from("text_agent_conversations")
      .select("text_agent_id")
      .eq("id", conversationId)
      .in("text_agent_id", agentIds)
      .maybeSingle();
    if (conv?.text_agent_id) {
      const { data: agentRow } = await db
        .from("text_agents")
        .select("human_only")
        .eq("id", conv.text_agent_id)
        .maybeSingle();
      if (agentRow?.human_only === true) {
        return NextResponse.json(
          { error: "Este agente solo atiende con humanos." },
          { status: 400 }
        );
      }
    }
  }
  const { data, error } = await db
    .from("text_agent_conversations")
    .update({
      assigned_to: assignedTo,
      handoff_mode: handoffMode,
      status_label: statusLabel,
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .in("text_agent_id", agentIds)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return NextResponse.json({ error: "Ejecuta la migración 016_inbox_handoff en Supabase" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const record = toTextConversationRecord(data);
  return NextResponse.json({
    conversation: record,
    can_reply: record.handoff_mode === "human" && Boolean(record.assigned_to)
  });
}
