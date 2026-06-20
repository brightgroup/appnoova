import { Modality } from "@google/genai";
import { geminiTemperature } from "@/lib/voice-agent-audio";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";

/** Recomendaciones AI Studio (native audio) — ver docs/GEMINI-LIVE-VOICE.md */
export const GEMINI_LIVE_RECOMMENDED = {
  model: DEFAULT_LIVE_MODEL,
  temperatureRange: { min: 0.95, max: 1.1, default: 1.0 },
  defaultVoiceFemale: "Kore",
  defaultVoiceMale: "Charon",
  proactiveAudio: false,
  contextWindowCompression: true,
} as const;

/** Temperatura para Gemini Live: rango alto mantiene entonación paisa viva. */
export function geminiLiveTemperature(stored: number): number {
  const t = geminiTemperature(stored);
  if (t < 0.88) return 0.92;
  return Math.min(1.15, t);
}

export interface GeminiLiveSessionConfigInput {
  systemInstruction: string;
  voiceName: string;
  temperature: number;
}

/** Config compartida para browser y bridge Telnyx (@google/genai live.connect). */
export function buildGeminiLiveSessionConfig(input: GeminiLiveSessionConfigInput) {
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: input.voiceName || GEMINI_LIVE_RECOMMENDED.defaultVoiceFemale },
      },
    },
    thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
    temperature: geminiLiveTemperature(input.temperature),
    systemInstruction: input.systemInstruction,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
