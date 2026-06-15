import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { CrmContact, CrmFieldProvenanceEntry } from "@/types/crm";
import { runOriJsonPrompt } from "@/lib/crm-gemini";
import { mergeCompanyContext } from "@/lib/merge-company-context";

const EXTRACTABLE_FIELDS = [
  "name",
  "tipo_contacto",
  "documento_id",
  "organizacion",
  "whatsapp",
  "telefono",
  "email",
  "ciudad",
  "categorias_interes",
  "notes"
] as const;

export type CrmExtractableField = (typeof EXTRACTABLE_FIELDS)[number];

export interface CrmAiFieldSuggestion {
  field: CrmExtractableField;
  value: string | string[];
  confidence: "alta" | "media" | "baja";
  source_text?: string;
}

export interface CrmAiExtractResult {
  suggestions: CrmAiFieldSuggestion[];
}

const EXTRACT_SYSTEM = `Eres un asistente que extrae datos de contacto CRM desde conversaciones de WhatsApp o documentos.
Responde SOLO JSON válido con forma: { "suggestions": [{ "field": "...", "value": "...", "confidence": "alta|media|baja", "source_text": "..." }] }
Campos permitidos: name, tipo_contacto (persona|empresa), documento_id, organizacion, whatsapp, telefono, email, ciudad, categorias_interes (array), notes.
No inventes datos. Solo extrae lo explícito o muy inferible. Teléfonos en E.164 si es posible.
tipo_contacto=empresa si habla en nombre de una empresa, pide cotización corporativa o menciona NIT/razón social.`;

function formatTranscript(messages: TextChatMessage[]): string {
  return messages
    .filter(m => m.content?.trim() || m.media_label)
    .map(m => {
      const who = m.role === "user" ? "Contacto" : m.role === "human" ? "Asesor" : "IA";
      const body = m.content?.trim() || `[${m.media_label ?? m.media_type ?? "media"}]`;
      return `${who}: ${body}`;
    })
    .join("\n");
}

export async function extractContactFieldsFromConversation(
  messages: TextChatMessage[],
  current: Partial<CrmContact>
): Promise<CrmAiExtractResult> {
  const transcript = formatTranscript(messages);
  if (!transcript.trim()) return { suggestions: [] };

  const prompt = `Contacto actual (JSON): ${JSON.stringify({
    name: current.name,
    tipo_contacto: current.tipo_contacto,
    documento_id: current.documento_id,
    organizacion: current.organizacion,
    whatsapp: current.whatsapp,
    telefono: current.telefono,
    email: current.email,
    ciudad: current.ciudad,
    categorias_interes: current.categorias_interes,
    notes: current.notes
  })}

Conversación:
${transcript}

Extrae solo campos nuevos o que corrigen datos vacíos/incorrectos.`;

  const raw = await runOriJsonPrompt<{ suggestions?: CrmAiFieldSuggestion[] }>(EXTRACT_SYSTEM, prompt);
  const suggestions = (raw.suggestions ?? []).filter(s =>
    EXTRACTABLE_FIELDS.includes(s.field as CrmExtractableField) &&
    s.value != null &&
    String(s.value).trim() !== ""
  );
  return { suggestions };
}

export async function extractContactFieldsFromDocument(
  fileBase64: string,
  mimeType: string,
  current: Partial<CrmContact>
): Promise<CrmAiExtractResult> {
  const { runOriDocumentExtract } = await import("@/lib/crm-gemini");
  const prompt = `Documento del contacto. Datos actuales: ${JSON.stringify({
    name: current.name,
    documento_id: current.documento_id,
    organizacion: current.organizacion
  })}
Extrae campos de identidad y contacto visibles en el documento.`;

  const raw = await runOriDocumentExtract<{ suggestions?: CrmAiFieldSuggestion[] }>(
    EXTRACT_SYSTEM,
    prompt,
    fileBase64,
    mimeType
  );
  const suggestions = (raw.suggestions ?? []).filter(s =>
    EXTRACTABLE_FIELDS.includes(s.field as CrmExtractableField)
  );
  return { suggestions };
}

export function iaProvenanceEntry(confidence: "alta" | "media" | "baja"): CrmFieldProvenanceEntry {
  return {
    origen: "ia_conversacion",
    confianza: confidence,
    verificado: false,
    actualizado_por: "sistema_ia",
    actualizado_en: new Date().toISOString()
  };
}

export function documentProvenanceEntry(confidence: "alta" | "media" | "baja"): CrmFieldProvenanceEntry {
  return {
    origen: "documento",
    confianza: confidence,
    verificado: false,
    actualizado_por: "sistema_ia",
    actualizado_en: new Date().toISOString()
  };
}

export function suggestionsToPatch(
  suggestions: CrmAiFieldSuggestion[],
  fields: string[],
  provenanceBuilder: (c: "alta" | "media" | "baja") => CrmFieldProvenanceEntry
): { patch: Record<string, unknown>; provenanceFields: Record<string, CrmFieldProvenanceEntry> } {
  const patch: Record<string, unknown> = {};
  const provenanceFields: Record<string, CrmFieldProvenanceEntry> = {};
  const selected = new Set(fields);

  for (const s of suggestions) {
    if (!selected.has(s.field)) continue;
    if (s.field === "categorias_interes") {
      patch.categorias_interes = Array.isArray(s.value) ? s.value : String(s.value).split(",").map(x => x.trim()).filter(Boolean);
    } else if (s.field === "tipo_contacto") {
      const v = String(Array.isArray(s.value) ? s.value[0] : s.value).trim();
      patch.tipo_contacto = v === "empresa" ? "empresa" : "persona";
    } else {
      patch[s.field] = Array.isArray(s.value) ? s.value.join(", ") : String(s.value).trim();
    }
    if (s.field === "telefono") patch.phone = patch.telefono;
    if (s.field === "organizacion") patch.company = patch.organizacion;
    provenanceFields[s.field] = provenanceBuilder(s.confidence);
  }

  return { patch, provenanceFields };
}

export interface CrmQuoteRecord {
  id: string;
  created_at: string;
  title: string;
  summary: string;
  body: string;
  whatsapp_message: string;
}

export async function generateOriQuote(
  contact: CrmContact,
  ctx?: {
    labels?: { producto?: string; categoria?: string };
    companyContext?: string;
    lead?: {
      title: string;
      categoria_interes?: string | null;
      producto_interes?: string | null;
      value_amount?: number | null;
      currency?: string;
      stage_name?: string | null;
    };
  }
): Promise<CrmQuoteRecord> {
  const { runOriTextPrompt } = await import("@/lib/crm-gemini");

  const baseSystem = `Eres Ori, copiloto de seguros en Colombia. Genera cotizaciones claras, profesionales y en español colombiano.
Incluye: saludo personalizado, producto/ramo sugerido, supuestos, rango o valor referencial (si no hay datos exactos, indícalo), próximo paso y cierre cordial.
No inventes primas exactas sin datos — usa rangos orientativos o pide el dato faltante.
Si hay contexto de oportunidad/lead, prioriza categoría y producto de la oportunidad sobre datos genéricos del contacto.
Si hay conocimiento de la empresa (tarifarios, productos), úsalo como fuente prioritaria para montos y condiciones.`;

  const system = mergeCompanyContext(baseSystem, ctx?.companyContext ?? "");

  const leadBlock = ctx?.lead
    ? `
Oportunidad (lead):
Título: ${ctx.lead.title}
Etapa: ${ctx.lead.stage_name ?? "—"}
Categoría oportunidad: ${ctx.lead.categoria_interes ?? "—"}
Producto oportunidad: ${ctx.lead.producto_interes ?? "—"}
Valor estimado: ${ctx.lead.value_amount != null ? `${ctx.lead.value_amount} ${ctx.lead.currency ?? "COP"}` : "—"}`
    : "";

  const prompt = `Genera una cotización para este contacto:

Nombre: ${contact.name}
Tipo: ${contact.tipo_contacto}
Organización: ${contact.organizacion ?? "—"}
Ciudad: ${contact.ciudad ?? "—"}
WhatsApp: ${contact.whatsapp ?? "—"}
${ctx?.labels?.categoria ? `Categoría (${ctx.labels.categoria}): ${(contact.categorias_interes ?? []).join(", ") || "—"}` : ""}
Relación: ${contact.tipo_relacion}
Notas: ${contact.notes ?? "—"}${leadBlock}

Responde en dos bloques separados por "---WHATSAPP---":
1) Cotización completa (para PDF o email)
2) Mensaje corto para WhatsApp (máx 900 caracteres)`;

  const raw = await runOriTextPrompt(system, prompt);
  const [body, whatsapp_message = ""] = raw.split("---WHATSAPP---").map(s => s.trim());

  const title = ctx?.lead
    ? `Cotización — ${ctx.lead.title}`
    : `Cotización — ${contact.name}`;
  const summary = body.split("\n").find(l => l.trim().length > 20)?.slice(0, 120) ?? "Cotización generada por ORI";

  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    title,
    summary,
    body,
    whatsapp_message: whatsapp_message || body.slice(0, 900)
  };
}

/** @deprecated Usa generateOriQuote */
export async function generateContactQuote(
  contact: CrmContact,
  labels?: { producto?: string; categoria?: string }
): Promise<CrmQuoteRecord> {
  return generateOriQuote(contact, { labels });
}
