import type { TextChatMessage } from "@/types/text-agent-conversation";
import type {
  CrmLead,
  CrmLeadOutcome,
  CrmMotivoPerdida,
  CrmPipelineStage
} from "@/types/crm";
import { runOriJsonPrompt, type OriPromptResult } from "@/lib/crm-gemini";
import {
  DEFAULT_STAGE_AI_CRITERIA,
  detectCommercialIntent,
  formatTranscriptForAi,
  isQuoteStageSlug,
  resolvePipelineStage
} from "@/lib/crm-lead-ai-shared";

export interface CrmLeadAiFieldUpdate {
  title?: string | null;
  categoria_interes?: string | null;
  producto_interes?: string | null;
  value_amount?: number | null;
  score?: number | null;
  notes?: string | null;
}

export interface CrmLeadAnalysisResult {
  should_create_lead: boolean;
  create_reason?: string;
  target_stage_slug: string | null;
  stage_confidence: "alta" | "media" | "baja";
  outcome: CrmLeadOutcome | null;
  motivo_perdida: CrmMotivoPerdida | null;
  field_updates: CrmLeadAiFieldUpdate;
  suggest_ori_quote: boolean;
  reasoning?: string;
}

const MOTIVOS: CrmMotivoPerdida[] = [
  "precio",
  "no_respondio",
  "compro_otro",
  "no_era_momento",
  "sin_presupuesto",
  "datos_incompletos",
  "otro"
];

function stageCriteriaBlock(stages: CrmPipelineStage[]): string {
  return stages
    .filter(s => !s.is_won && !s.is_lost)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => {
      const criteria =
        s.ai_enter_criteria?.trim() ||
        DEFAULT_STAGE_AI_CRITERIA[s.slug] ||
        "Sin criterio — usa el nombre de la etapa como guía.";
      return `- slug: "${s.slug}" | nombre: "${s.name}" | orden: ${s.sort_order}\n  Criterio para entrar: ${criteria}`;
    })
    .join("\n");
}

const EMPTY_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

export async function analyzeLeadFromConversation(input: {
  messages: TextChatMessage[];
  contact: { id: string; name: string; categorias_interes?: string[] };
  stages: CrmPipelineStage[];
  openLead: CrmLead | null;
}): Promise<OriPromptResult<CrmLeadAnalysisResult>> {
  const transcript = formatTranscriptForAi(input.messages);
  if (!transcript.trim()) {
    return { result: emptyAnalysis(), usage: EMPTY_USAGE, model: "" };
  }

  const system = `Eres Ori, copiloto comercial de un CRM en Colombia.
Analizas conversaciones de WhatsApp para:
1) Decidir si crear una oportunidad (lead) nueva.
2) Determinar en qué etapa del pipeline debe estar el lead abierto.
3) Proponer actualizaciones de campos del lead.
4) Detectar cierre ganado o perdido.

Reglas:
- Usa los criterios de cada etapa (configurados por el tenant) como regla principal para mover etapas.
- Solo mueve a una etapa si la conversación cumple su criterio.
- No retrocedas de etapa salvo evidencia clara (confianza alta).
- outcome "won" o "lost" solo con confianza alta y evidencia explícita.
- Si outcome es "lost", incluye motivo_perdida del enum.
- suggest_ori_quote=true cuando el cliente pide cotización/precio o la etapa destino es cotizado.
- should_create_lead=true si hay intención de compra/cotización y no hay lead abierto.

Responde SOLO JSON:
{
  "should_create_lead": boolean,
  "create_reason": string,
  "target_stage_slug": string | null,
  "stage_confidence": "alta" | "media" | "baja",
  "outcome": "open" | "won" | "lost" | null,
  "motivo_perdida": "precio" | "no_respondio" | ... | null,
  "field_updates": {
    "title": string | null,
    "categoria_interes": string | null,
    "producto_interes": string | null,
    "value_amount": number | null,
    "score": number | null,
    "notes": string | null
  },
  "suggest_ori_quote": boolean,
  "reasoning": string
}`;

  const leadBlock = input.openLead
    ? `Lead abierto actual:
${JSON.stringify({
  id: input.openLead.id,
  title: input.openLead.title,
  stage_slug: input.openLead.stage?.slug ?? null,
  stage_name: input.openLead.stage?.name ?? null,
  categoria_interes: input.openLead.categoria_interes,
  producto_interes: input.openLead.producto_interes,
  value_amount: input.openLead.value_amount,
  score: input.openLead.score,
  outcome: input.openLead.outcome
})}`
    : "No hay lead abierto para este contacto.";

  const prompt = `Contacto: ${input.contact.name}
Categorías contacto: ${(input.contact.categorias_interes ?? []).join(", ") || "—"}

Etapas del pipeline (en orden):
${stageCriteriaBlock(input.stages)}

${leadBlock}

Conversación:
${transcript}`;

  const { result: raw, usage, model } = await runOriJsonPrompt<Partial<CrmLeadAnalysisResult>>(system, prompt);

  const outcome =
    raw.outcome === "won" || raw.outcome === "lost" || raw.outcome === "open"
      ? raw.outcome
      : null;

  const motivo =
    raw.motivo_perdida && MOTIVOS.includes(raw.motivo_perdida as CrmMotivoPerdida)
      ? (raw.motivo_perdida as CrmMotivoPerdida)
      : null;

  let conf =
    raw.stage_confidence === "alta" || raw.stage_confidence === "media" || raw.stage_confidence === "baja"
      ? raw.stage_confidence
      : "baja";

  const commercialIntent = detectCommercialIntent(transcript);
  let targetSlug = raw.target_stage_slug ? String(raw.target_stage_slug) : null;
  const resolved = resolvePipelineStage(input.stages, targetSlug);
  if (resolved) targetSlug = resolved.slug;

  let shouldCreate = Boolean(raw.should_create_lead);
  if (!input.openLead && commercialIntent && conf === "baja") {
    conf = "media";
    shouldCreate = true;
    if (!targetSlug) {
      const quoteStage = resolvePipelineStage(input.stages, "cotizado");
      if (quoteStage) targetSlug = quoteStage.slug;
    }
  }

  return {
    result: {
      should_create_lead: shouldCreate,
      create_reason: raw.create_reason ? String(raw.create_reason) : undefined,
      target_stage_slug: targetSlug,
      stage_confidence: conf,
      outcome,
      motivo_perdida: motivo,
      field_updates: sanitizeFieldUpdates(raw.field_updates),
      suggest_ori_quote: Boolean(raw.suggest_ori_quote) || commercialIntent || Boolean(resolved && isQuoteStageSlug(resolved.slug)),
      reasoning: raw.reasoning ? String(raw.reasoning) : undefined
    },
    usage,
    model
  };
}

function sanitizeFieldUpdates(raw: CrmLeadAiFieldUpdate | undefined): CrmLeadAiFieldUpdate {
  if (!raw || typeof raw !== "object") return {};
  const out: CrmLeadAiFieldUpdate = {};
  if (raw.title != null && String(raw.title).trim()) out.title = String(raw.title).trim();
  if (raw.categoria_interes != null && String(raw.categoria_interes).trim()) {
    out.categoria_interes = String(raw.categoria_interes).trim();
  }
  if (raw.producto_interes != null && String(raw.producto_interes).trim()) {
    out.producto_interes = String(raw.producto_interes).trim();
  }
  if (raw.value_amount != null && !Number.isNaN(Number(raw.value_amount))) {
    out.value_amount = Number(raw.value_amount);
  }
  if (raw.score != null) {
    const score = Number(raw.score);
    if (!Number.isNaN(score) && score >= 0 && score <= 100) out.score = score;
  }
  if (raw.notes != null && String(raw.notes).trim()) out.notes = String(raw.notes).trim();
  return out;
}

function emptyAnalysis(): CrmLeadAnalysisResult {
  return {
    should_create_lead: false,
    target_stage_slug: null,
    stage_confidence: "baja",
    outcome: null,
    motivo_perdida: null,
    field_updates: {},
    suggest_ori_quote: false
  };
}
