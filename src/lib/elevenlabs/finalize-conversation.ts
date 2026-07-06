import {
  getElevenLabsConversation,
  type ElevenLabsConversationDetail,
} from "@/lib/elevenlabs/outbound-call";
import { waitForElevenLabsConversationReady } from "@/lib/elevenlabs/premium-voices";
import { transcriptIndicatesVoicemail } from "@/lib/voice-voicemail-detection";

/** Espera a que ElevenLabs cierre la conversación y devuelva transcripción usable. */
export async function loadElevenLabsConversationForFinalize(
  conversationId: string
): Promise<ElevenLabsConversationDetail> {
  await waitForElevenLabsConversationReady(conversationId, { maxAttempts: 15, delayMs: 800 });

  let conv = await getElevenLabsConversation(conversationId);
  for (
    let i = 0;
    i < 6 &&
    conv.transcript.length === 0 &&
    (conv.status === "done" || conv.status === "failed" || conv.status === "processing");
    i++
  ) {
    await new Promise(r => setTimeout(r, 1000));
    conv = await getElevenLabsConversation(conversationId);
  }
  return conv;
}

/** Determina si la conversación fue buzón de voz (API + contenido). */
export function conversationIsVoicemail(conv: ElevenLabsConversationDetail): boolean {
  if (conv.voicemailDetected) return true;
  return transcriptIndicatesVoicemail(conv.transcript, conv.terminationReason ?? conv.errorReason);
}
