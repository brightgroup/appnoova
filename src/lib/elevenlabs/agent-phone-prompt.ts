import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { ELEVENLABS_TEMPORAL_PROMPT_BLOCK } from "@/lib/colombia-calendar";
import { buildVoiceCompanyContextSection } from "@/lib/merge-company-context";
import {
  PREMIUM_CALL_ENDING_PROMPT,
  PREMIUM_OUTBOUND_PICKUP_PROMPT,
} from "@/lib/elevenlabs/default-voices";
import { ELEVENLABS_PHONE_OUTBOUND_RULES } from "@/lib/elevenlabs/voice-platform-prompt";
import { buildVoiceAccentPromptSection } from "@/lib/voice-accent-profile";

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

/** Bloque duro: la salida de voz debe ser 100 % español colombiano. */
export const ELEVENLABS_SPANISH_ONLY_RULES = `

## IDIOMA (REGLA ABSOLUTA — PRIORIDAD MÁXIMA)
- Habla ÚNICAMENTE en español colombiano. Cada palabra que pronuncies debe estar en español.
- PROHIBIDO hablar en inglés: ni párrafos, ni frases sueltas ("I understand", "Thank you", "Hello", "Sure", "okay", "right"), ni mezcla de idiomas.
- Si el cliente dice "hello" o palabras sueltas en inglés, responde en español colombiano.
- Si en algún momento te descubres escribiendo o diciendo una palabra en inglés, DETENTE y dila en español. Jamás continúes una frase en inglés.
- Las instrucciones internas del prompt pueden estar en cualquier idioma; tu SALIDA DE VOZ es siempre español, en TODO momento de la llamada.

## SALIDA LIMPIA — NADA DE RAZONAMIENTO NI META-TEXTO (REGLA ABSOLUTA)
- Todo lo que escribas se convierte en voz y lo oye el cliente. Escribe SOLO lo que le dirías a la persona, nada más.
- PROHIBIDO narrar, explicar o pensar en voz alta sobre tus acciones o herramientas. NUNCA escribas frases como "I need to use the end_call tool", "The user has explicitly stated", "Voy a usar la herramienta...", "I should", "Let me", "Now I will", ni ningún comentario sobre lo que vas a hacer.
- Las herramientas (end_call, voicemail_detection) se ejecutan EN SILENCIO. Nunca menciones su nombre ni expliques por qué las usas. Solo di tu frase en español y ejecútalas sin anunciarlas.
- NUNCA mezcles tu respuesta con texto de análisis, planeación o justificación (ni en inglés ni en español). Tu mensaje termina en tu última palabra dirigida al cliente: no agregues nada después.`;

/**
 * Orden del prompt en llamada:
 * 1. Identidad y reglas técnicas → 2. Plantilla del agente (conducta + protocolo) →
 * 3. Acento → 4. Contexto de marca (al final, referencia) → 5. Telefonía saliente/cierre.
 */
export function buildElevenLabsAgentSystemPrompt(input: {
  prompt: string;
  purposeId: string;
  agentName: string;
  companyName: string;
  companyContextText?: string;
  /** Llamada saliente por teléfono (prueba o campaña), aunque la plantilla sea inbound. */
  phoneOutbound?: boolean;
}): string {
  const outboundPurpose = isOutboundVoicePurpose(input.purposeId);
  const phoneOutbound = input.phoneOutbound === true;
  const identity = buildPremiumAgentIdentityBlock(input.agentName, input.companyName);
  const agentPrompt = input.prompt.trim();
  const companyContext = buildVoiceCompanyContextSection(
    input.companyName,
    input.companyContextText
  );

  const phoneOutboundBlocks =
    phoneOutbound || outboundPurpose
      ? `${PREMIUM_OUTBOUND_PICKUP_PROMPT}${ELEVENLABS_PHONE_OUTBOUND_RULES}`
      : "";

  const accentSection = buildVoiceAccentPromptSection(input.purposeId);

  return `${identity}\n\n${ELEVENLABS_SPANISH_ONLY_RULES}\n\n${ELEVENLABS_TEMPORAL_PROMPT_BLOCK}\n\n${agentPrompt}${companyContext}\n\n${accentSection}${phoneOutboundBlocks}${PREMIUM_CALL_ENDING_PROMPT}`;
}
