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

/** Instrucción de cierre — el agente debe colgar cuando el usuario se despide. */
export const PREMIUM_CALL_ENDING_PROMPT = `

## Cierre de llamada (obligatorio)
- Si TÚ o la persona se despiden ("chao", "adiós", "listo", "gracias eso era todo", "hasta luego", "que estés bien"): responde SOLO una frase corta de despedida (máximo 8 palabras) y TERMINA. No hagas preguntas ni sigas vendiendo.
- Tras despedirte, no hables más. El sistema colgará automáticamente.
- Si la persona ya se despidió, no repitas el pitch ni preguntes "¿algo más?". Solo despídete y calla.`;
