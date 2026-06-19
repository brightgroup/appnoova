import { resolvePurposeId, type AgentChannel } from "@/lib/agent-purpose-catalog";

export interface VoiceAccentProfile {
  id: string;
  label: string;
  suggestedVoice: string;
  temperature: number;
  /** Bloque markdown para el prompt del agente */
  promptSection: string;
  /** Mensaje de arranque para Gemini Live (kickoff) */
  kickoffMessage: string;
}

const PAISA_BASE = `## Voz y acento (obligatorio en llamadas)

- Habla en **español colombiano paisa** (Medellín / Antioquia): natural, cálido y humano.
- Ritmo conversacional: frases cortas (máximo ~15 palabras por turno en teléfono).
- Usa expresiones naturales con moderación: "listo", "claro", "con gusto", "¿me regalas…?", "perfecto", "dale".
- **Nunca** suenes como locutor de radio, asistente genérico ni español de España o México.
- **No** uses voseo rioplatense ni modismos mexicanos ("órale", "mande", "chido").
- Pausas breves entre ideas; no monólogos largos.
- En teléfono: una pregunta a la vez; confirma datos antes de continuar.`;

const PAISA_CHEERFUL = `${PAISA_BASE}
- Tono **alegre y motivador** — transmite energía positiva sin exagerar.
- Sonríe con la voz: entusiasmo genuino al calificar leads o invitar a avanzar.
- Puedes usar "parce" o "bacano" con moderación si el contexto es informal.`;

const PAISA_SERIOUS = `${PAISA_BASE}
- Tono **serio, respetuoso y formal** — ideal para recordatorios y avisos importantes.
- Usa **usted** de forma consistente; evita slang y diminutivos.
- Claridad absoluta: fecha, monto o acción requerida sin rodeos.
- Transmite confianza y responsabilidad, no alarmismo.`;

const PAISA_WARM = `${PAISA_BASE}
- Tono **cálido y profesional** — empatía sin perder foco comercial.
- Reconoce el contexto del cliente antes de retomar el tema.
- Invita al siguiente paso con naturalidad, sin presión agresiva.`;

const PAISA_CALM = `${PAISA_BASE}
- Tono **tranquilo y empático** — ideal para soporte y dudas.
- Escucha activa: parafrasea lo que entendiste antes de responder.
- Si no sabes algo, dilo con honestidad y ofrece escalar a un humano.`;

const PAISA_EFFICIENT = `${PAISA_BASE}
- Tono **eficiente y amable** — coordina citas sin rodeos.
- Confirma fecha, hora y canal de contacto de forma explícita.
- Repite el resumen de la cita al cerrar.`;

const PROFILES: Record<string, VoiceAccentProfile> = {
  "lead-qualification": {
    id: "lead-qualification",
    label: "Paisa alegre",
    suggestedVoice: "Kore",
    temperature: 0.85,
    promptSection: PAISA_CHEERFUL,
    kickoffMessage:
      "Inicia la llamada con UN saludo breve, alegre y paisa (estilo Medellín). Una sola frase, tono entusiasta pero profesional. Luego espera en silencio.",
  },
  "policy-reminder": {
    id: "policy-reminder",
    label: "Serio formal",
    suggestedVoice: "Charon",
    temperature: 0.72,
    promptSection: PAISA_SERIOUS,
    kickoffMessage:
      "Inicia la llamada con UN saludo breve, serio y formal en español colombiano. Tono de recordatorio importante, sin slang. Una sola frase. Luego espera en silencio.",
  },
  "follow-up": {
    id: "follow-up",
    label: "Paisa cálida",
    suggestedVoice: "Aoede",
    temperature: 0.8,
    promptSection: PAISA_WARM,
    kickoffMessage:
      "Inicia la llamada con UN saludo breve, cálido y paisa. Tono de seguimiento comercial amable. Una sola frase. Luego espera en silencio.",
  },
  "customer-service": {
    id: "customer-service",
    label: "Paisa empática",
    suggestedVoice: "Kore",
    temperature: 0.78,
    promptSection: PAISA_CALM,
    kickoffMessage:
      "Inicia la llamada con UN saludo breve, empático y paisa. Tono de atención al cliente tranquilo. Una sola frase. Luego espera en silencio.",
  },
  "meeting-scheduling": {
    id: "meeting-scheduling",
    label: "Paisa eficiente",
    suggestedVoice: "Aoede",
    temperature: 0.8,
    promptSection: PAISA_EFFICIENT,
    kickoffMessage:
      "Inicia la llamada con UN saludo breve, amable y paisa. Tono eficiente para agendar. Una sola frase. Luego espera en silencio.",
  },
};

const DEFAULT_PROFILE = PROFILES["lead-qualification"];

export function resolveVoicePurposeId(rawId?: string | null): string {
  if (!rawId?.trim()) return "lead-qualification";
  return resolvePurposeId("voice", rawId);
}

export function getVoiceAccentProfile(purposeOrTemplateId?: string | null): VoiceAccentProfile {
  const id = resolveVoicePurposeId(purposeOrTemplateId);
  return PROFILES[id] ?? DEFAULT_PROFILE;
}

export function suggestVoiceForPurpose(purposeOrTemplateId?: string | null): string {
  return getVoiceAccentProfile(purposeOrTemplateId).suggestedVoice;
}

export function suggestTemperatureForPurpose(purposeOrTemplateId?: string | null): number {
  return getVoiceAccentProfile(purposeOrTemplateId).temperature;
}

export function buildVoiceAccentPromptSection(purposeOrTemplateId?: string | null): string {
  return getVoiceAccentProfile(purposeOrTemplateId).promptSection;
}

export function buildVoiceKickoffMessage(purposeOrTemplateId?: string | null): string {
  return getVoiceAccentProfile(purposeOrTemplateId).kickoffMessage;
}

/** Voz sugerida: plantilla primero; si hay nombre, heurística de género puede sobreescribir en el wizard. */
export function suggestVoiceForAgent(
  purposeOrTemplateId?: string | null,
  agentName?: string | null,
  inferFromName?: (name: string) => string
): string {
  const fromPurpose = suggestVoiceForPurpose(purposeOrTemplateId);
  const trimmed = agentName?.trim() ?? "";
  if (trimmed.length >= 2 && inferFromName) {
    return inferFromName(trimmed);
  }
  return fromPurpose;
}

export function appendVoiceAccentToPrompt(
  prompt: string,
  channel: AgentChannel,
  purposeOrTemplateId?: string | null
): string {
  if (channel !== "voice") return prompt.trim();
  const section = buildVoiceAccentPromptSection(purposeOrTemplateId);
  return `${prompt.trim()}\n\n${section}`;
}
