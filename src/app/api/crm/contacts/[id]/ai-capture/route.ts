import { NextRequest, NextResponse } from "next/server";
import type { TextChatMessage } from "@/types/text-agent-conversation";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import {
  documentProvenanceEntry,
  extractContactFieldsFromConversation,
  iaProvenanceEntry,
  suggestionsToPatch
} from "@/lib/crm-ai-extract";
import { recordOriUsageForUser } from "@/lib/billing/meter";
import { toCrmContact } from "@/lib/crm-record";
import type { CrmFieldProvenance } from "@/types/crm";

type Ctx = { params: Promise<{ id: string }> };

function normalizeMessages(raw: unknown): TextChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(m => m && typeof m === "object") as TextChatMessage[];
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(_req, "view");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const { data: contactRow } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!contactRow) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(contactRow);
  if (!contact.inbox_conversation_id) {
    return NextResponse.json({ suggestions: [], message: "Sin conversación vinculada" });
  }

  const { data: conv } = await db
    .from("text_agent_conversations")
    .select("messages")
    .eq("id", contact.inbox_conversation_id)
    .eq("user_id", userId)
    .maybeSingle();

  try {
    const { result, usage, model } = await extractContactFieldsFromConversation(
      normalizeMessages(conv?.messages),
      contact
    );
    await recordOriUsageForUser({
      db,
      userId,
      eventType: "form_fill",
      usage,
      model,
      channel: "crm_ai_capture",
      referenceType: "crm_contact",
      referenceId: id
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de IA";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const body = await req.json();
  const fields = Array.isArray(body.fields) ? body.fields.map(String) : [];
  const source = body.source === "document" ? "document" : "conversation";

  if (!fields.length) {
    return NextResponse.json({ error: "fields es requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: existing } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(existing);
  let suggestions = body.suggestions as import("@/lib/crm-ai-extract").CrmAiFieldSuggestion[] | undefined;

  if (!suggestions?.length && source === "conversation" && contact.inbox_conversation_id) {
    const { data: conv } = await db
      .from("text_agent_conversations")
      .select("messages")
      .eq("id", contact.inbox_conversation_id)
      .eq("user_id", userId)
      .maybeSingle();
    const extracted = await extractContactFieldsFromConversation(
      normalizeMessages(conv?.messages),
      contact
    );
    suggestions = extracted.result.suggestions;
    await recordOriUsageForUser({
      db,
      userId,
      eventType: "form_fill",
      usage: extracted.usage,
      model: extracted.model,
      channel: "crm_ai_capture",
      referenceType: "crm_contact",
      referenceId: id
    });
  }

  if (!suggestions?.length) {
    return NextResponse.json({ error: "No hay sugerencias para aplicar" }, { status: 400 });
  }

  const provBuilder = source === "document" ? documentProvenanceEntry : iaProvenanceEntry;
  const { patch, provenanceFields } = suggestionsToPatch(suggestions, fields, provBuilder);

  const prevProv = (existing.field_provenance as CrmFieldProvenance) ?? {};
  const field_provenance = { ...prevProv, ...provenanceFields };

  const { data, error } = await db
    .from("crm_contacts")
    .update({ ...patch, field_provenance, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data ? toCrmContact(data) : null });
}
