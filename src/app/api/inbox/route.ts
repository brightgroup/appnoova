import { NextRequest, NextResponse } from "next/server";
import {
  filterInboxItems,
  inboxDetailChannelLabel,
  sortInboxItems,
  textRowToInboxItem
} from "@/lib/inbox-utils";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase-table-error";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";
import type { InboxDetail, InboxFilter } from "@/types/inbox";

function parseFilter(raw: string | null): InboxFilter {
  if (raw === "mine" || raw === "unassigned") return raw;
  return "all";
}

async function loadTextAgentNames(
  db: ReturnType<typeof textAgentsAdminClient>,
  userId: string
): Promise<Record<string, string>> {
  const { data } = await db.from("text_agents").select("id, name").eq("user_id", userId);
  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    names[String(row.id)] = String(row.name ?? "Agente");
  }
  return names;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const currentUserName = user ? userDisplayName(user) : "Usuario";

  if (id) {
    const { data, error } = await db
      .from("text_agent_conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ detail: null, dbReady: false });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    const record = toTextConversationRecord(data);
    const textNames = await loadTextAgentNames(db, userId);
    const detail: InboxDetail = {
      kind: "text",
      id: record.id,
      contact_label: record.contact_label,
      channel: record.channel,
      channel_label: inboxDetailChannelLabel(record.channel),
      agent_id: record.text_agent_id,
      agent_name: textNames[record.text_agent_id] ?? String(record.metadata.agent_name ?? "Agente"),
      assigned_to: record.assigned_to,
      handoff_mode: record.handoff_mode,
      unread_count: record.unread_count,
      status: record.status,
      messages: record.messages,
      created_at: record.created_at,
      updated_at: record.updated_at
    };

    await db
      .from("text_agent_conversations")
      .update({ unread_count: 0 })
      .eq("id", id)
      .eq("user_id", userId);

    return NextResponse.json({
      detail: { ...detail, unread_count: 0 },
      current_user_name: currentUserName,
      dbReady: true
    });
  }

  const textNames = await loadTextAgentNames(db, userId);

  const listSelectWithHandoff =
    "id, text_agent_id, channel, contact_label, messages_count, status, assigned_to, handoff_mode, unread_count, messages, summary, created_at, updated_at";
  const listSelectLegacy =
    "id, text_agent_id, channel, contact_label, messages_count, status, messages, summary, created_at, updated_at";

  const textResPrimary = await db
    .from("text_agent_conversations")
    .select(listSelectWithHandoff)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);

  const textRes =
    textResPrimary.error && isMissingColumnError(textResPrimary.error)
      ? await db
          .from("text_agent_conversations")
          .select(listSelectLegacy)
          .eq("user_id", userId)
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
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const assignTo = body.assign_to as string | null | undefined;
  const db = textAgentsAdminClient();
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

  const { data, error } = await db
    .from("text_agent_conversations")
    .update({
      assigned_to: assignedTo,
      handoff_mode: handoffMode,
      status_label: statusLabel,
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .eq("user_id", userId)
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
