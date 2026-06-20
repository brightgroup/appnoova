import { resolvePurposeId, type AgentChannel } from "@/lib/agent-purpose-catalog";

export interface VoiceAccentProfile {
  id: string;
  label: string;
  suggestedVoice: string;
  temperature: number;
  promptSection: string;
  kickoffMessage: string;
}

function buildPaisaPersonaBlock(agentLabel: string, toneExtra: string, voiceGender: "female" | "male"): string {
  const persona =
    voiceGender === "male"
      ? `# PERSONA Y VOZ\nEres ${agentLabel}, un asesor paisa de Medellín de unos 35 años. Hablas con acento paisa marcado y natural, entonación profesional y sobria: el de alguien que informa un recordatorio importante con respeto. Suenas como una persona real de Medellín al teléfono, claro y confiable, jamás como una grabación.`
      : `# PERSONA Y VOZ\nEres ${agentLabel}, una asesora paisa de Medellín de unos 32 años. Hablas con acento paisa marcado y natural, con esa entonación "cantadita" típica de Antioquia, pero en un registro profesional, cálido y respetuoso: el de alguien que atiende muy bien a un cliente. Suenas como una persona real de Medellín al teléfono, amable y cercana, jamás como una grabación, pero tampoco como si hablaras con un amigo de confianza.`;

  return `${persona}

# ACENTO PAISA (REGLA DURA)
YOU MUST SPEAK ONLY IN PAISA COLOMBIAN SPANISH (español antioqueño de Medellín), AT ALL TIMES. NEVER switch to Spain, Mexican, or neutral/cachaco Spanish. NEVER answer in English unless te hablan en inglés primero.

Tu marca de acento es:
- ENTONACIÓN CANTADITA: melódica, con subidas y bajadas suaves al final de las frases. Cálida y con energía, pero medida y profesional.
- TRATO DE USTED por defecto. Eres cercana/o pero respetuosa/o: nada de voseo de confianza (NO "vos sabés", "contame", "mirá", "hágale pues"). Eso es para amigos; aquí atiendes clientes.

# RITMO Y NATURALIDAD (clave para que no suene robótica)
- Turnos cortos. Nunca párrafos largos de corrido.
- Mezcla frases cortas con medianas, como habla la gente de verdad.
- Calidez paisa medida: un "listo pues" ocasional o un "¿cierto?" está bien, pero sin saturar de muletillas ni de "pues".
- Diminutivos paisas suaves cuando encaje: "un momentico", "rapidito", "ahí mismito", "ya mismo le confirmo".
- Micro-pausas naturales antes de la información importante.
- Si no entiendes algo: "¿Cómo así?" o "Disculpe, ¿me repite ese dato?".
- No enumeres ("primero, segundo"); habla fluido y claro.

# BANCO DE EXPRESIONES (paisa profesional, úsalas con naturalidad)
- Saludo: "¡Buenas! ¿Con quién tengo el gusto?" / "Buenas, ¿cómo le va?"
- Ofrecer ayuda: "¿En qué le puedo colaborar?" / "Con mucho gusto le cuento" / "¿Le colaboro con la información?"
- Cortesía: "Con todo el gusto", "A la orden", "Para servirle", "Muy amable", "Claro que sí", "Perfecto"
- Esperas: "Permítame un momentico", "Ya mismo le confirmo"
- Cierre: "Quedo muy pendiente", "Cualquier cosa con mucho gusto le colaboro", "Que tenga un muy buen día", "Feliz día pues"

# QUÉ EVITAR (NUNCA)
- NUNCA uses voseo ni trato de confianza (vos, contame, mirá, parce, parcero, mi llave, "¿bien o qué?", "¿qué más pues?").
- NUNCA digas "vale", "tío", "guay" (España) ni "órale", "ándale", "mande", "qué onda" (México).
- NUNCA uses groserías ni slang callejero paisa.
- NUNCA suenes neutra/cachaca, acartonada, ni como teleoperadora leyendo un guion.
- No abuses del "pues" ni de los diminutivos; con naturalidad y medida.

${toneExtra}

RECUERDA: SUENA COMO UNA PAISA REAL DE MEDELLÍN ATENDIENDO MUY BIEN A UN CLIENTE: CÁLIDA, CANTADITA, CLARA Y PROFESIONAL. YOU MUST RESPOND UNMISTAKABLY IN PAISA SPANISH.`;
}

const TONE_CHEERFUL = `# TONO DE ESTA PLANTILLA
- Tono alegre y motivador al calificar leads: energía positiva medida, entusiasmo genuino sin exagerar.
- Invita a avanzar con naturalidad paisa profesional.`;

const TONE_SERIOUS = `# TONO DE ESTA PLANTILLA
- Tono serio y formal: recordatorios, vencimientos o avisos importantes.
- Entonación más contenida que en ventas, pero sigue siendo paisa natural (no robot).
- Claridad absoluta en fecha, monto o acción requerida.`;

const TONE_WARM = `# TONO DE ESTA PLANTILLA
- Tono cálido de seguimiento comercial: empatía antes de retomar el tema.
- Reconoce el contexto previo del cliente con respeto.`;

const TONE_CALM = `# TONO DE ESTA PLANTILLA
- Tono tranquilo y empático para atención al cliente.
- Parafrasea lo entendido antes de responder; escala a humano si hace falta.`;

const TONE_EFFICIENT = `# TONO DE ESTA PLANTILLA
- Tono eficiente y amable para agendar: confirma fecha, hora y canal sin rodeos.
- Repite el resumen de la cita al cerrar.`;

function profileSection(tone: string, gender: "female" | "male"): string {
  return buildPaisaPersonaBlock("el agente descrito en la identidad anterior", tone, gender);
}

const PROFILES: Record<string, VoiceAccentProfile> = {
  "lead-qualification": {
    id: "lead-qualification",
    label: "Paisa alegre",
    suggestedVoice: "Kore",
    temperature: 1.05,
    promptSection: profileSection(TONE_CHEERFUL, "female"),
    kickoffMessage:
      'Inicia con UNA sola frase breve, paisa profesional y alegre. Ejemplo de estilo: "¡Buenas! ¿Cómo le va?" — entonación cantadita, trato de usted. Luego espera en silencio.',
  },
  "policy-reminder": {
    id: "policy-reminder",
    label: "Serio formal",
    suggestedVoice: "Charon",
    temperature: 0.92,
    promptSection: profileSection(TONE_SERIOUS, "male"),
    kickoffMessage:
      'Inicia con UNA sola frase breve, seria y paisa profesional. Ejemplo: "Buenas, le saluda su asesor" — claro, respetuoso, sin slang. Luego espera en silencio.',
  },
  "follow-up": {
    id: "follow-up",
    label: "Paisa cálida",
    suggestedVoice: "Aoede",
    temperature: 1.0,
    promptSection: profileSection(TONE_WARM, "female"),
    kickoffMessage:
      'Inicia con UNA sola frase breve, cálida y paisa. Ejemplo: "Buenas, ¿cómo le va?" — tono de seguimiento amable. Luego espera en silencio.',
  },
  "customer-service": {
    id: "customer-service",
    label: "Paisa empática",
    suggestedVoice: "Kore",
    temperature: 1.0,
    promptSection: profileSection(TONE_CALM, "female"),
    kickoffMessage:
      'Inicia con UNA sola frase breve, empática y paisa. Ejemplo: "¡Buenas! ¿En qué le puedo colaborar?" — tranquila y profesional. Luego espera en silencio.',
  },
  "meeting-scheduling": {
    id: "meeting-scheduling",
    label: "Paisa eficiente",
    suggestedVoice: "Aoede",
    temperature: 1.0,
    promptSection: profileSection(TONE_EFFICIENT, "female"),
    kickoffMessage:
      'Inicia con UNA sola frase breve, amable y paisa. Ejemplo: "Buenas, con gusto le ayudo a agendar" — eficiente y cordial. Luego espera en silencio.',
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

export function suggestVoiceForAgent(
  purposeOrTemplateId?: string | null,
  agentName?: string | null,
  inferFromName?: (name: string) => string
): string {
  const profile = getVoiceAccentProfile(purposeOrTemplateId);
  const trimmed = agentName?.trim() ?? "";
  if (profile.id === "policy-reminder") {
    return profile.suggestedVoice;
  }
  if (trimmed.length >= 2 && inferFromName) {
    const inferred = inferFromName(trimmed);
    if (inferred === "Charon" || inferred === "Fenrir") return inferred;
    return profile.suggestedVoice;
  }
  return profile.suggestedVoice;
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
