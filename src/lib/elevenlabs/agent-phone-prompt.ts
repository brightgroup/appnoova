import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { ELEVENLABS_TEMPORAL_PROMPT_BLOCK } from "@/lib/colombia-calendar";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import {
  PREMIUM_CALL_ENDING_PROMPT,
  PREMIUM_OUTBOUND_PICKUP_PROMPT,
} from "@/lib/elevenlabs/default-voices";

export function isOutboundVoicePurpose(purposeId: string): boolean {
  return getPurposeMeta("voice", purposeId).tag === "Outbound";
}

export function buildPremiumAgentIdentityBlock(agentName: string, companyName: string): string {
  const name = agentName.trim() || "su asesor";
  const empresa = companyName.trim() || "Mi empresa";
  return [
    `IMPORTANTE: Tu nombre es "${name}". Preséntate siempre con ese nombre.`,
    `IMPORTANTE: La empresa se llama "${empresa}". Al presentarte di siempre ese nombre exacto.`,
    `No digas "Mi empresa", "la empresa" ni inventes otro nombre. Si el prompt tiene placeholders, ignóralos y usa "${empresa}".`,
  ].join("\n");
}

const OUTBOUND_OPENING_RULES = `

## Regla de apertura en llamada saliente (obligatorio)
- En tu PRIMER turno de voz: una sola frase breve con tu nombre y el nombre exacto de la empresa.
- PROHIBIDO en la apertura: resumir la empresa, leer "Contexto de la empresa", listar servicios, dar pitch o explicar el motivo largo.
- Tras el saludo, pregunta con quién hablas (si aplica) y espera respuesta antes de explicar el motivo de la llamada.`;

/** Prompt completo para agente ElevenLabs (sync + override en llamada saliente). */
export function buildElevenLabsAgentSystemPrompt(input: {
  prompt: string;
  purposeId: string;
  agentName: string;
  companyName: string;
  companyContextText?: string;
}): string {
  const outbound = isOutboundVoicePurpose(input.purposeId);
  const identity = buildPremiumAgentIdentityBlock(input.agentName, input.companyName);
  const merged = mergeCompanyContext(
    input.prompt.trim(),
    input.companyContextText?.trim() ?? ""
  );

  const outboundBlocks = outbound
    ? `${PREMIUM_OUTBOUND_PICKUP_PROMPT}${OUTBOUND_OPENING_RULES}`
    : "";

  return `${identity}\n\n${ELEVENLABS_TEMPORAL_PROMPT_BLOCK}\n\n${merged}${outboundBlocks}${PREMIUM_CALL_ENDING_PROMPT}`;
}
