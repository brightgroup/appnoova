import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { CrmPipelineStage } from "@/types/crm";

export const DEFAULT_STAGE_AI_CRITERIA: Record<string, string> = {
  nuevo:
    "Lead recién creado o primer mensaje del prospecto sin respuesta del asesor o IA.",
  contacto_inicial:
    "Lead recién creado o primer mensaje del prospecto sin respuesta del asesor o IA.",
  contactado:
    "Hay diálogo activo: el asesor o la IA ya respondió y la conversación continúa.",
  en_seguimiento:
    "Hay diálogo activo: el asesor o la IA ya respondió y la conversación continúa.",
  cotizado:
    "El cliente pidió cotización, precio o tarifa; o se envió o discutió una propuesta formal.",
  en_cotizacion:
    "El cliente pidió cotización, precio o tarifa; o se envió o discutió una propuesta formal.",
  negociacion:
    "Objeciones, comparación con competencia, negociación de condiciones o cierre pendiente."
};

export function formatTranscriptForAi(messages: TextChatMessage[]): string {
  return messages
    .filter(m => m.content?.trim() || m.media_label)
    .map(m => {
      const who = m.role === "user" ? "Contacto" : m.role === "human" ? "Asesor" : "IA";
      const body = m.content?.trim() || `[${m.media_label ?? m.media_type ?? "media"}]`;
      return `${who}: ${body}`;
    })
    .join("\n");
}

export function resolveStageCriteria(slug: string, custom?: string | null): string {
  return custom?.trim() || DEFAULT_STAGE_AI_CRITERIA[slug] || "";
}

const QUOTE_INTENT_RE =
  /\b(cotiz|cotizaci[oó]n|precio|tarifa|cu[aá]nto\s+cuesta|seguro|p[oó]liza|vida|autos?|salud|plan)\b/i;

const QUOTE_STAGE_SLUGS = new Set(["cotizado", "en_cotizacion", "cotizacion"]);

export function detectCommercialIntent(transcript: string): boolean {
  return QUOTE_INTENT_RE.test(transcript);
}

export function isQuoteStageSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = slug.toLowerCase();
  return QUOTE_STAGE_SLUGS.has(s) || s.includes("cotiz");
}

/** Resuelve slug sugerido por la IA al stage real del tenant (slugs legacy incluidos). */
export function resolvePipelineStage(
  stages: CrmPipelineStage[],
  slugHint: string | null | undefined
): CrmPipelineStage | null {
  if (!slugHint) return null;
  const hint = slugHint.toLowerCase().trim();
  const active = stages.filter(s => !s.is_won && !s.is_lost);

  const exact = active.find(s => s.slug.toLowerCase() === hint);
  if (exact) return exact;

  const aliases: Record<string, string[]> = {
    cotizado: ["cotizado", "en_cotizacion", "cotizacion"],
    contactado: ["contactado", "en_seguimiento", "contacto_inicial"],
    nuevo: ["nuevo", "contacto_inicial"],
    negociacion: ["negociacion", "negociación"]
  };

  for (const [canonical, slugs] of Object.entries(aliases)) {
    if (slugs.includes(hint) || hint === canonical) {
      const match = active.find(s => slugs.includes(s.slug.toLowerCase()));
      if (match) return match;
    }
  }

  const byName = active.find(s => s.name.toLowerCase().includes(hint.replace(/_/g, " ")));
  if (byName) return byName;

  if (hint.includes("cotiz")) {
    return active.find(s => isQuoteStageSlug(s.slug)) ?? null;
  }

  return null;
}
