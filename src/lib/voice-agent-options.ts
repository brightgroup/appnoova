export const GEMINI_VOICES = [
  { id: "Aoede", label: "Aoede – Femenina, cálida" },
  { id: "Kore", label: "Kore – Femenina, clara" },
  { id: "Charon", label: "Charon – Masculina, profunda" },
  { id: "Fenrir", label: "Fenrir – Masculina, enérgica" },
  { id: "Puck", label: "Puck – Neutra, amigable" }
] as const;

export const VOICE_MODELS = [
  {
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    label: "Gemini 2.5 Flash Native Audio"
  }
] as const;

export const LLM_MODELS = [
  {
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    label: "Gemini 2.5 Flash (Live)"
  }
] as const;

export const DEFAULT_LIVE_MODEL = VOICE_MODELS[0].id;
