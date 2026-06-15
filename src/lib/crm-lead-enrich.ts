import type { SupabaseClient } from "@supabase/supabase-js";
import { getOriApiKey } from "@/lib/google-ai";
import { getDefaultCompanyContextContent } from "@/lib/company-context";
import { iaProvenanceEntry, generateOriQuote } from "@/lib/crm-ai-extract";
import { analyzeLeadFromConversation, type CrmLeadAnalysisResult } from "@/lib/crm-lead-ai";
import {
  detectCommercialIntent,
  formatTranscriptForAi,
  isQuoteStageSlug,
  resolvePipelineStage
} from "@/lib/crm-lead-ai-shared";
import { getTenantLabels } from "@/lib/crm-labels";
import { scoreToTemperatura } from "@/lib/crm-lead-utils";
import { getCrmStages } from "@/lib/crm-server";
import { toCrmContact, toCrmLead } from "@/lib/crm-record";
import type { CrmFieldProvenance, CrmFieldProvenanceEntry, CrmLead, CrmPipelineStage } from "@/types/crm";
import type { TextChatMessage } from "@/types/text-agent-conversation";

function normalizeMessages(raw: unknown): TextChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(m => m && typeof m === "object") as TextChatMessage[];
}

function leadProv(confidence: "alta" | "media" | "baja"): CrmFieldProvenanceEntry {
  return iaProvenanceEntry(confidence);
}

function shouldApplyLeadField(
  lead: CrmLead,
  field: string,
  confidence: "alta" | "media" | "baja"
): boolean {
  const prov = lead.field_provenance?.[field];
  if (prov?.verificado && prov.origen === "manual") return false;
  if (confidence === "baja") return false;
  return true;
}

function shouldMoveStage(
  current: CrmPipelineStage | null | undefined,
  target: CrmPipelineStage,
  confidence: "alta" | "media" | "baja"
): boolean {
  if (!current || current.id === target.id) return current?.id !== target.id;
  if (confidence === "alta") return true;
  if (confidence === "media") return target.sort_order >= current.sort_order;
  return false;
}

async function maybeAutoQuote(
  db: SupabaseClient,
  userId: string,
  leadId: string,
  contactId: string,
  stageSlug: string
): Promise<void> {
  if (stageSlug !== "cotizado" && stageSlug !== "en_cotizacion" && !isQuoteStageSlug(stageSlug)) return;

  const [{ data: leadRow }, { data: contactRow }, labels, companyContext] = await Promise.all([
    db
      .from("crm_leads")
      .select("*, stage:crm_pipeline_stages(*)")
      .eq("id", leadId)
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("crm_contacts").select("*").eq("id", contactId).eq("user_id", userId).maybeSingle(),
    getTenantLabels(db, userId),
    getDefaultCompanyContextContent(db, userId)
  ]);

  if (!leadRow || !contactRow) return;

  const lead = toCrmLead(leadRow as Record<string, unknown>);
  const contact = toCrmContact(contactRow);

  try {
    const quote = await generateOriQuote(contact, {
      labels: { categoria: labels.categoria_interes, producto: labels.producto_servicio },
      lead: {
        title: lead.title,
        categoria_interes: lead.categoria_interes,
        producto_interes: lead.producto_interes,
        value_amount: lead.value_amount,
        currency: lead.currency,
        stage_name: lead.stage?.name ?? null
      },
      companyContext
    });

    const meta = (leadRow.metadata as Record<string, unknown>) ?? {};
    const prev = (meta.crm_quotes as unknown[]) ?? [];
    await db
      .from("crm_leads")
      .update({
        metadata: { ...meta, crm_quotes: [quote, ...prev].slice(0, 10), last_quote_id: quote.id },
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[crm/lead-enrich] auto quote:", err);
  }
}

async function applyAnalysisToLead(
  db: SupabaseClient,
  userId: string,
  lead: CrmLead,
  stages: CrmPipelineStage[],
  analysis: CrmLeadAnalysisResult
): Promise<{ leadId: string; updated: string[] }> {
  const updated: string[] = [];
  const conf = analysis.stage_confidence;
  const patch: Record<string, unknown> = {};
  const prov: CrmFieldProvenance = { ...(lead.field_provenance ?? {}) };

  const fu = analysis.field_updates;
  if (fu.title && shouldApplyLeadField(lead, "title", conf)) {
    patch.title = fu.title;
    prov.title = leadProv(conf);
    updated.push("title");
  }
  if (fu.categoria_interes && shouldApplyLeadField(lead, "categoria_interes", conf)) {
    patch.categoria_interes = fu.categoria_interes;
    prov.categoria_interes = leadProv(conf);
    updated.push("categoria_interes");
  }
  if (fu.producto_interes && shouldApplyLeadField(lead, "producto_interes", conf)) {
    patch.producto_interes = fu.producto_interes;
    prov.producto_interes = leadProv(conf);
    updated.push("producto_interes");
  }
  if (fu.value_amount != null && shouldApplyLeadField(lead, "value_amount", conf)) {
    patch.value_amount = fu.value_amount;
    prov.value_amount = leadProv(conf);
    updated.push("value_amount");
  }
  if (fu.score != null && shouldApplyLeadField(lead, "score", conf)) {
    patch.score = fu.score;
    patch.temperatura = scoreToTemperatura(fu.score);
    prov.score = leadProv(conf);
    updated.push("score");
  }
  if (fu.notes && shouldApplyLeadField(lead, "notes", conf)) {
    patch.notes = lead.notes ? `${lead.notes}\n${fu.notes}` : fu.notes;
    prov.notes = leadProv(conf);
    updated.push("notes");
  }

  if (analysis.outcome === "won" || analysis.outcome === "lost") {
    if (conf === "alta") {
      patch.outcome = analysis.outcome;
      prov.outcome = leadProv("alta");
      updated.push("outcome");
      if (analysis.outcome === "lost" && analysis.motivo_perdida) {
        patch.motivo_perdida = analysis.motivo_perdida;
        prov.motivo_perdida = leadProv("alta");
        updated.push("motivo_perdida");
      }
    }
  } else if (analysis.target_stage_slug) {
    const target = resolvePipelineStage(stages, analysis.target_stage_slug);
    if (target && shouldMoveStage(lead.stage ?? undefined, target, conf)) {
      patch.stage_id = target.id;
      patch.stage_entered_at = new Date().toISOString();
      prov.stage_id = leadProv(conf);
      updated.push("stage_id");
    }
  }

  patch.fecha_ultima_interaccion = new Date().toISOString();
  patch.field_provenance = prov;
  patch.updated_at = new Date().toISOString();

  if (updated.length === 0) {
    await db
      .from("crm_leads")
      .update({
        fecha_ultima_interaccion: patch.fecha_ultima_interaccion,
        updated_at: patch.updated_at
      })
      .eq("id", lead.id)
      .eq("user_id", userId);
    return { leadId: lead.id, updated };
  }

  const { error } = await db
    .from("crm_leads")
    .update(patch)
    .eq("id", lead.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[crm/lead-enrich] update:", error.message);
    return { leadId: lead.id, updated: [] };
  }

  const newSlug = analysis.target_stage_slug ?? lead.stage?.slug;
  if (
    analysis.suggest_ori_quote &&
    newSlug &&
    (newSlug === "cotizado" || newSlug === "en_cotizacion") &&
    updated.includes("stage_id")
  ) {
    void maybeAutoQuote(db, userId, lead.id, lead.contact_id, newSlug);
  }

  return { leadId: lead.id, updated };
}

async function createOpenLead(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  conversationId: string,
  stages: CrmPipelineStage[],
  contactName: string,
  categorias: string[],
  analysis: CrmLeadAnalysisResult
): Promise<CrmLead | null> {
  const target =
    resolvePipelineStage(stages, analysis.target_stage_slug) || stages[0];
  if (!target) return null;

  const now = new Date().toISOString();
  const title = analysis.field_updates.title?.trim() || `Oportunidad — ${contactName}`;

  const { data, error } = await db
    .from("crm_leads")
    .insert({
      user_id: userId,
      contact_id: contactId,
      stage_id: target.id,
      title,
      outcome: "open",
      currency: "COP",
      sort_order: 0,
      stage_entered_at: now,
      inbox_conversation_id: conversationId,
      categoria_interes: analysis.field_updates.categoria_interes ?? categorias[0] ?? null,
      producto_interes: analysis.field_updates.producto_interes ?? null,
      value_amount: analysis.field_updates.value_amount ?? null,
      score: analysis.field_updates.score ?? null,
      temperatura: scoreToTemperatura(analysis.field_updates.score ?? null),
      fecha_ultima_interaccion: now,
      field_provenance: {
        title: leadProv(analysis.stage_confidence),
        stage_id: leadProv(analysis.stage_confidence)
      },
      metadata: analysis.reasoning
        ? { ai_create_reason: analysis.create_reason ?? analysis.reasoning }
        : {}
    })
    .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
    .single();

  if (error) {
    console.error("[crm/lead-enrich] create:", error.message);
    return null;
  }

  const lead = toCrmLead(data as Record<string, unknown>);
  if (
    analysis.suggest_ori_quote &&
    isQuoteStageSlug(target.slug)
  ) {
    void maybeAutoQuote(db, userId, lead.id, contactId, target.slug);
  }
  return lead;
}

export async function enrichCrmLeadFromWhatsAppConversation(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  conversationId: string
): Promise<{ created: boolean; leadId: string | null; updated: string[] }> {
  if (!getOriApiKey()) {
    console.warn("[crm/lead-enrich] ORI_GOOGLE_AI_KEY no configurada — pipeline IA desactivado");
    return { created: false, leadId: null, updated: [] };
  }

  const [{ data: contactRow }, { data: conv }, stages] = await Promise.all([
    db.from("crm_contacts").select("*").eq("id", contactId).eq("user_id", userId).maybeSingle(),
    db
      .from("text_agent_conversations")
      .select("messages")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    getCrmStages(db, userId)
  ]);

  if (!contactRow || !stages.length) {
    return { created: false, leadId: null, updated: [] };
  }

  const messages = normalizeMessages(conv?.messages);
  const transcript = formatTranscriptForAi(messages);
  if (!transcript.trim()) {
    return { created: false, leadId: null, updated: [] };
  }

  const contact = toCrmContact(contactRow);

  const { data: openRows } = await db
    .from("crm_leads")
    .select("*, stage:crm_pipeline_stages(*)")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .eq("outcome", "open")
    .order("updated_at", { ascending: false })
    .limit(1);

  const openLead = openRows?.[0] ? toCrmLead(openRows[0] as Record<string, unknown>) : null;

  let analysis: CrmLeadAnalysisResult;
  try {
    analysis = await analyzeLeadFromConversation({
      messages,
      contact: {
        id: contact.id,
        name: contact.name,
        categorias_interes: contact.categorias_interes
      },
      stages,
      openLead
    });
  } catch (err) {
    console.error("[crm/lead-enrich] analyze:", err);
    return { created: false, leadId: openLead?.id ?? null, updated: [] };
  }

  if (!openLead) {
    const transcript = formatTranscriptForAi(messages);
    const commercialIntent = detectCommercialIntent(transcript);
    const shouldCreate =
      (analysis.should_create_lead &&
        (analysis.stage_confidence === "alta" || analysis.stage_confidence === "media")) ||
      (commercialIntent && analysis.stage_confidence !== "baja");
    if (!shouldCreate) {
      await storeLeadAnalysisDebug(db, userId, conversationId, analysis, {
        skipped: "no_create_signal"
      });
      return { created: false, leadId: null, updated: [] };
    }
    const created = await createOpenLead(
      db,
      userId,
      contactId,
      conversationId,
      stages,
      contact.name,
      contact.categorias_interes ?? [],
      analysis
    );
    await storeLeadAnalysisDebug(db, userId, conversationId, analysis, {
      created: Boolean(created),
      leadId: created?.id ?? null
    });
    return {
      created: Boolean(created),
      leadId: created?.id ?? null,
      updated: created ? ["created"] : []
    };
  }

  const result = await applyAnalysisToLead(db, userId, openLead, stages, analysis);
  await storeLeadAnalysisDebug(db, userId, conversationId, analysis, {
    leadId: result.leadId,
    updated: result.updated
  });
  return { created: false, leadId: result.leadId, updated: result.updated };
}

async function storeLeadAnalysisDebug(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  analysis: CrmLeadAnalysisResult,
  extra: Record<string, unknown>
): Promise<void> {
  try {
    const { data: conv } = await db
      .from("text_agent_conversations")
      .select("metadata")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    const meta = (conv?.metadata as Record<string, unknown>) ?? {};
    await db
      .from("text_agent_conversations")
      .update({
        metadata: {
          ...meta,
          crm_last_lead_analysis: {
            at: new Date().toISOString(),
            ...analysis,
            ...extra
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[crm/lead-enrich] debug metadata:", err);
  }
}

export async function enrichCrmLeadForConversationId(
  db: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<{ created: boolean; leadId: string | null; updated: string[] }> {
  const { data: contact } = await db
    .from("crm_contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("inbox_conversation_id", conversationId)
    .maybeSingle();

  if (!contact?.id) {
    const { data: conv } = await db
      .from("text_agent_conversations")
      .select("metadata")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    const linked = (conv?.metadata as Record<string, unknown> | undefined)?.crm_contact_id;
    if (!linked) return { created: false, leadId: null, updated: [] };
    return enrichCrmLeadFromWhatsAppConversation(db, userId, String(linked), conversationId);
  }

  return enrichCrmLeadFromWhatsAppConversation(db, userId, String(contact.id), conversationId);
}
