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

export const ELEVENLABS_DEFAULT_VOICES = CURATED_PREMIUM_VOICES.map(v => ({
  id: v.id,
  label: v.label,
}));

/** Saludo proactivo para agentes inbound o prueba web outbound. */
export function buildPremiumFirstMessage(agentName: string, companyName: string): string {
  return `Buenas tardes, le saluda ${agentName} de ${companyName}. ¿Con quién tengo el gusto?`;
}

/**
 * Llamadas salientes por teléfono: el humano contesta con "aló"/"bueno" antes de que hable la IA.
 * Se combina con first_message vacío en outbound-call (ElevenLabs espera al usuario).
 */
export const PREMIUM_OUTBOUND_PICKUP_PROMPT = `

## Apertura en llamada saliente (obligatorio)
- Tú iniciaste la llamada; la persona acaba de contestar. NO hables hasta que diga algo ("aló", "bueno", "dígame", "hola", "sí", etc.).
- Cuando responda, saluda en UNA sola frase breve y natural (presenta nombre y empresa) y continúa el guion.
- No repitas el saludo si ya saludaste; no hables encima de la persona.`;

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
