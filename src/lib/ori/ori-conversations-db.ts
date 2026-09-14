import type { SupabaseClient } from "@supabase/supabase-js";
import type { OriToolCall, OriConversationSummary, OriConversationDetail, OriConversationMessage } from "@/types/ori";

const TITLE_MAX = 60;

/** Deriva el título del chat del primer mensaje del usuario, igual que Claude/ChatGPT/Gemini — sin UI de renombrar todavía. */
export function deriveConversationTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Nuevo chat";
  if (trimmed.length <= TITLE_MAX) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX).trimEnd()}…`;
}

interface ConversationRow {
  id: string;
  title: string;
  quote_id: string | null;
  company_context_id: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

function toSummary(row: ConversationRow): OriConversationSummary {
  return {
    id: row.id,
    title: row.title,
    quoteId: row.quote_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listConversations(
  db: SupabaseClient,
  organizationId: string,
  userId: string,
  limit = 50
): Promise<OriConversationSummary[]> {
  const { data, error } = await db
    .from("ori_conversations")
    .select("id, title, quote_id, company_context_id, model, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map(toSummary);
}

export async function getConversationWithMessages(
  db: SupabaseClient,
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<OriConversationDetail | null> {
  const { data: conv, error: convError } = await db
    .from("ori_conversations")
    .select("id, title, quote_id, company_context_id, model, created_at, updated_at")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convError) throw new Error(convError.message);
  if (!conv) return null;

  const { data: msgs, error: msgError } = await db
    .from("ori_conversation_messages")
    .select("id, role, content, tool_calls, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (msgError) throw new Error(msgError.message);

  const messages: OriConversationMessage[] = (msgs ?? []).map(m => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    toolCalls: (Array.isArray(m.tool_calls) ? m.tool_calls : []) as OriToolCall[],
    createdAt: m.created_at
  }));

  return { ...toSummary(conv), companyContextId: conv.company_context_id, model: conv.model, messages };
}

interface CreateConversationInput {
  organizationId: string;
  userId: string;
  title: string;
  quoteId?: string | null;
  companyContextId?: string | null;
  model?: string | null;
}

export async function createConversation(db: SupabaseClient, input: CreateConversationInput): Promise<string> {
  const { data, error } = await db
    .from("ori_conversations")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      title: input.title,
      quote_id: input.quoteId ?? null,
      company_context_id: input.companyContextId ?? null,
      model: input.model ?? null
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

interface AppendMessageInput {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: OriToolCall[];
}

export async function appendConversationMessages(db: SupabaseClient, messages: AppendMessageInput[]): Promise<void> {
  if (messages.length === 0) return;
  const { error } = await db.from("ori_conversation_messages").insert(
    messages.map(m => ({
      conversation_id: m.conversationId,
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls ?? []
    }))
  );
  if (error) throw new Error(error.message);

  const conversationId = messages[0].conversationId;
  await db.from("ori_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function deleteConversation(
  db: SupabaseClient,
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { error, count } = await db
    .from("ori_conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
