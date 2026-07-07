/** Voces premium curadas para Noova — Colombia primero. */
export interface CuratedPremiumVoice {
  id: string;
  label: string;
  region: "colombia" | "mexico" | "spain" | "english";
}

export const CURATED_PREMIUM_VOICES: CuratedPremiumVoice[] = [
  // Colombia — primero (Bogotá, Paisa/Medellín, general)
  { id: "fuwN6hWqDt4SvK4KVpN4", label: "Tatiana — Bogotá, femenina", region: "colombia" },
  { id: "J4vZAFDEcpenkMp3f3R9", label: "Valentina — Paisa / Medellín", region: "colombia" },
  { id: "3Fx71T889APcHRu4VtQf", label: "Voz Colombiana — Medellín, cálida", region: "colombia" },
  { id: "86V9x9hrQds83qf7zaGn", label: "Marcela — Colombiana, conversacional", region: "colombia" },
  { id: "VmejBeYhbrcTPwDniox7", label: "Lina — Colombiana, fresca", region: "colombia" },
  { id: "x5IDPSl4ZUbhosMmVFTk", label: "Lúminā — Bogotá, clara y natural", region: "colombia" },
  { id: "TjldTGy7iELoRNPa6sJh", label: "Daniel — Bogotá, comercial masculino", region: "colombia" },
  { id: "j7XQZUnVCfhpa94EsaJS", label: "Dipemo — Colombiano, profesional", region: "colombia" },
  // Otros acentos (máx. uno por región)
  { id: "13VFWfJ7e20fmvmaqXWl", label: "Marisol — Mexicana, conversacional", region: "mexico" },
  { id: "3shIUa1rsV99mOvl84iN", label: "JuanDiego — Castellano / España", region: "spain" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — Inglés, profesional", region: "english" },
];

export const DEFAULT_ELEVENLABS_VOICE_ID = CURATED_PREMIUM_VOICES[0].id;

export const ELEVENLABS_DEFAULT_VOICES = CURATED_PREMIUM_VOICES.filter(v => v.region === "colombia").map(v => ({
  id: v.id,
  label: v.label,
}));

/** Saludo proactivo para agentes inbound o prueba web outbound. */
export function buildPremiumFirstMessage(agentName: string, companyName: string): string {
  return `Buenas tardes, le saluda ${agentName} de ${companyName}. ¿Con quién tengo el gusto?`;
}

/** Subtítulo bajo el nombre en la prueba web premium. */
export function resolvePremiumVoiceSubtitle(voiceId?: string | null): string {
  const voice = CURATED_PREMIUM_VOICES.find(v => v.id === voiceId?.trim());
  if (!voice) return "Voz neuronal · Español (Colombia)";
  if (voice.region === "english") return "Voz neuronal · Inglés";
  const region =
    voice.region === "colombia" ? "Colombia" :
    voice.region === "mexico" ? "México" : "España";
  return `Voz neuronal · Español (${region})`;
}

/**
 * Saludo inmediato en campaña tras AMD humano (la persona ya contestó).
 */
export function buildOutboundCampaignFirstMessage(agentName: string, companyName: string): string {
  const name = agentName.trim() || "su asesor";
  const empresa = companyName.trim() || "Mi empresa";
  return `Buenas tardes, le saluda ${name} de ${empresa}. ¿Con quién tengo el gusto?`;
}

/**
 * Llamadas salientes directas (sin AMD previo): espera "aló" del cliente.
 * En campañas con AMD, la plataforma envía first_message y saluda al conectar.
 */
export const PREMIUM_OUTBOUND_PICKUP_PROMPT = `

## Apertura en llamada saliente (obligatorio)
- Si la persona acaba de decir "aló", "bueno", "dígame", "hola" o "sí": responde DE INMEDIATO en UNA sola frase breve (tu nombre y el nombre exacto de la empresa). No esperes más silencio.
- Si aún no ha dicho nada audible, espera un instante breve; en cuanto hable, saluda al momento.
- No des resumen de la empresa, pitch largo ni lista de servicios al abrir.
- No repitas el saludo si ya saludaste.`;

/** Instrucción de cierre — el agente debe usar end_call al despedirse. */
export const PREMIUM_CALL_ENDING_PROMPT = `

## Cierre de llamada (obligatorio)
- Si la persona se despide ("chao", "adiós", "gracias", "hasta luego", "cuelga", "listo"): responde UNA frase corta de despedida y usa la herramienta end_call de inmediato.
- Si TÚ te despides, di tu frase de cierre y usa end_call — no preguntes "¿algo más?" ni "¿sigue ahí?".
- Nunca sigas hablando después de una despedida. end_call es obligatorio tras cerrar.`;

export const PREMIUM_END_CALL_TOOL = {
  type: "system" as const,
  name: "end_call",
  description:
    "Colgar la llamada cuando el usuario se despide o cuando ya dijiste tu despedida final. Usar tras chao, adiós, gracias, hasta luego, cuelga o listo.",
};

/** Detecta buzón/contestadora y cuelga sin dejar mensaje (ahorra créditos). */
export const PREMIUM_VOICEMAIL_DETECTION_TOOL = {
  type: "system" as const,
  name: "voicemail_detection",
  description:
    "Usa esta herramienta en cuanto detectes buzón de voz, contestadora automática o mensaje grabado pidiendo dejar un mensaje. Cuelga de inmediato; NO hables ni dejes mensaje.",
};
