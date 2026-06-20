export function getElevenLabsApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

export function requireElevenLabsApiKey(): string {
  const key = getElevenLabsApiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY no configurado");
  return key;
}

/** ID del número en ElevenLabs (Phone Numbers) para outbound SIP. */
export function getElevenLabsPhoneNumberId(): string | null {
  return process.env.ELEVENLABS_PHONE_NUMBER_ID?.trim() || null;
}

export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** LLM dentro del agente premium. */
export const ELEVENLABS_DEFAULT_LLM = "gemini-2.0-flash";

/** TTS obligatorio para agentes no ingleses (es, etc.). */
export const ELEVENLABS_TTS_MODEL_ID = "eleven_flash_v2_5";
