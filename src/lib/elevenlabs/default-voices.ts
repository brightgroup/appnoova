/** Voces premium curadas (fallback si la API de voces falla). */
export const ELEVENLABS_DEFAULT_VOICES: { id: string; label: string; hint?: string }[] = [
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — femenina, clara" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura — femenina, cálida" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — masculina, profesional" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — masculina, neutra" },
];

export const DEFAULT_ELEVENLABS_VOICE_ID = ELEVENLABS_DEFAULT_VOICES[0].id;
