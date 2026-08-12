import type { SupabaseClient } from "@supabase/supabase-js";
import { getOriApiKey } from "@/lib/google-ai";
import {
  extractContactFieldsFromConversation,
  iaProvenanceEntry,
  type CrmAiFieldSuggestion,
  type CrmExtractableField
} from "@/lib/crm-ai-extract";
import { recordOriUsageForUser } from "@/lib/billing/meter";
import { canAutoUpdateField } from "@/lib/crm-contact-provenance";
import { toCrmContact } from "@/lib/crm-record";
import type { CrmContact, CrmFieldProvenance } from "@/types/crm";
import type { TextChatMessage } from "@/types/text-agent-conversation";

/** Campos que la IA puede rellenar en tiempo real durante la conversación */
const REALTIME_AI_FIELDS: CrmExtractableField[] = [
  "name",
  "tipo_contacto",
  "documento_id",
  "organizacion",
  "email",
  "ciudad",
  "categorias_interes"
];

function normalizeMessages(raw: unknown): TextChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(m => m && typeof m === "object") as TextChatMessage[];
}

function fieldValue(contact: CrmContact, field: CrmExtractableField): unknown {
  switch (field) {
    case "name":
      return contact.name;
    case "tipo_contacto":
      return contact.tipo_contacto;
    case "documento_id":
      return contact.documento_id;
    case "organizacion":
      return contact.organizacion;
    case "whatsapp":
      return contact.whatsapp;
    case "telefono":
      return contact.telefono;
    case "email":
      return contact.email;
    case "ciudad":
      return contact.ciudad;
    case "categorias_interes":
      return contact.categorias_interes;
    case "notes":
      return contact.notes;
    default:
      return undefined;
  }
}

function shouldApplySuggestion(contact: CrmContact, suggestion: CrmAiFieldSuggestion): boolean {
  const prov = contact.field_provenance?.[suggestion.field];
  const current = fieldValue(contact, suggestion.field);
  const e164 = contact.whatsapp ?? contact.telefono ?? undefined;

  if (suggestion.field === "name") {
    if (suggestion.confidence === "baja") return false;
    return canAutoUpdateField("name", current, prov, { treatPhoneAsEmpty: e164 });
  }

  if (suggestion.field === "tipo_contacto") {
    const v = String(Array.isArray(suggestion.value) ? suggestion.value[0] : suggestion.value).trim();
    if (v !== "persona" && v !== "empresa") return false;
    if (contact.tipo_contacto === v) return false;
    return canAutoUpdateField("tipo_contacto", current, prov);
  }

  if (suggestion.confidence === "baja") return false;
  return canAutoUpdateField(suggestion.field, current, prov, { treatPhoneAsEmpty: e164 });
}

function suggestionToPatchValue(suggestion: CrmAiFieldSuggestion): unknown {
  if (suggestion.field === "tipo_contacto") {
    const v = String(Array.isArray(suggestion.value) ? suggestion.value[0] : suggestion.value).trim();
    return v === "empresa" ? "empresa" : "persona";
  }
  if (suggestion.field === "categorias_interes") {
    return Array.isArray(suggestion.value)
      ? suggestion.value
      : String(suggestion.value).split(",").map(s => s.trim()).filter(Boolean);
  }
  return Array.isArray(suggestion.value) ? suggestion.value.join(", ") : String(suggestion.value).trim();
}

/**
 * Tras cada inbound de WhatsApp: extrae datos básicos de la conversación y actualiza
 * la ficha sin sobrescribir campos verificados manualmente.
 */
export async function enrichCrmContactFromWhatsAppConversation(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  conversationId: string
): Promise<{ updated: string[] }> {
  if (!getOriApiKey()) return { updated: [] };

  const [{ data: contactRow }, { data: conv }] = await Promise.all([
    db.from("crm_contacts").select("*").eq("id", contactId).eq("user_id", userId).maybeSingle(),
    db
      .from("text_agent_conversations")
      .select("messages")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (!contactRow) return { updated: [] };

  const contact = toCrmContact(contactRow);
  const messages = normalizeMessages(conv?.messages);
  if (messages.filter(m => m.role === "user").length === 0) return { updated: [] };

  let suggestions: CrmAiFieldSuggestion[];
  try {
    const extracted = await extractContactFieldsFromConversation(messages, contact);
    suggestions = extracted.result.suggestions.filter(s => REALTIME_AI_FIELDS.includes(s.field));
    // Enriquecimiento automático en tiempo real (no un botón que el cliente presionó):
    // costo real visible en /admin/consumption, sin cobrar crédito.
    await recordOriUsageForUser({
      db,
      userId,
      eventType: "form_fill",
      usage: extracted.usage,
      model: extracted.model,
      creditsOverride: 0,
      channel: "crm_contact_realtime_enrich",
      referenceType: "crm_contact",
      referenceId: contactId
    });
  } catch (err) {
    console.error("[crm/enrich] extract:", err);
    return { updated: [] };
  }

  const applicable = suggestions.filter(s => shouldApplySuggestion(contact, s));
  if (!applicable.length) return { updated: [] };

  const patch: Record<string, unknown> = {};
  const provenanceFields: CrmFieldProvenance = {};
  const updated: string[] = [];

  for (const s of applicable) {
    patch[s.field] = suggestionToPatchValue(s);
    if (s.field === "telefono") patch.phone = patch.telefono;
    if (s.field === "organizacion") patch.company = patch.organizacion;
    provenanceFields[s.field] = iaProvenanceEntry(s.confidence);
    updated.push(s.field);
  }

  const prevProv = contact.field_provenance ?? {};
  const field_provenance = { ...prevProv, ...provenanceFields };

  const { error } = await db
    .from("crm_contacts")
    .update({ ...patch, field_provenance, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("user_id", userId);

  if (error) {
    console.error("[crm/enrich] update:", error.message);
    return { updated: [] };
  }

  if (updated.length > 0) {
    console.info(`[crm/enrich] contact ${contactId} updated: ${updated.join(", ")}`);
  }

  return { updated };
}
