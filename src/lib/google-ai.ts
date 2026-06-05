/** API key para agentes de voz (Gemini Live). */
export function getVoiceGoogleApiKey(): string {
  return (
    process.env.GOOGLE_AI_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_AI_KEY?.trim() ||
    ""
  );
}

/** API key dedicada para Ori Copiloto (facturación separada en Google AI Studio). */
export function getOriApiKey(): string {
  return process.env.ORI_GOOGLE_AI_KEY?.trim() || "";
}

export const ORI_DEFAULT_MODEL = "gemini-2.5-flash";

export function getOriModel(): string {
  return process.env.ORI_GEMINI_MODEL?.trim() || ORI_DEFAULT_MODEL;
}
