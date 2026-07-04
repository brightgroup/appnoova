import { mergeCompanyContext } from "@/lib/merge-company-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { VOICE_OUTBOUND_PICKUP_PROMPT, VOICE_OUTBOUND_VOICEMAIL_PROMPT } from "@/lib/voice-accent-profile";

/** Instrucción de sistema para llamadas telefónicas (Gemini Live / Pipecat). */
export function buildPhoneAgentSystemInstruction(
  prompt: string,
  companyContextText: string,
  agentName?: string,
  sourceTemplate?: string | null,
  companyName?: string | null
): string {
  const name = agentName?.trim();
  const empresa = companyName?.trim();
  const identityLines = [
    name
      ? `IMPORTANTE: Tu nombre es "${name}". Preséntate siempre con ese nombre. Si el prompt menciona otro nombre, ignóralo y usa "${name}".`
      : "",
    empresa
      ? `IMPORTANTE: La empresa de la que llamas se llama "${empresa}". Al presentarte di siempre ese nombre exacto. No digas "Mi empresa", "la empresa" ni inventes otro nombre. Si el prompt tiene un placeholder de empresa, ignóralo y usa "${empresa}".`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const identityBlock = identityLines ? `${identityLines}\n\n` : "";

  const merged = mergeCompanyContext(prompt, companyContextText);
  const temporal = buildColombiaTemporalContext();

  return `${identityBlock}${temporal.promptBlock}\n\n${merged}
${VOICE_OUTBOUND_VOICEMAIL_PROMPT}
${VOICE_OUTBOUND_PICKUP_PROMPT}

## Cierre de llamada (obligatorio)
- Si la persona se despide, dice que no tiene tiempo, no puede hablar, o ya cumpliste el objetivo: responde con UNA sola frase breve, cordial y natural de despedida. Usa su nombre si lo conoces (ej. "Listo don Juan, que esté muy bien" o "Perfecto, muchas gracias por su tiempo, que tenga un buen día").
- Después de tu despedida final NO hagas más preguntas, no digas "¿algo más?" ni sigas hablando.
- Nunca termines en silencio: siempre di tu despedida antes de que la llamada cierre.`;
}
