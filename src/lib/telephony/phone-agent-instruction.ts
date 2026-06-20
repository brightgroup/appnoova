import { mergeCompanyContext } from "@/lib/merge-company-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { resolveVoicePurposeId } from "@/lib/voice-accent-profile";

/** Instrucción de sistema para llamadas telefónicas (Gemini Live / Pipecat). */
export function buildPhoneAgentSystemInstruction(
  prompt: string,
  companyContextText: string,
  agentName?: string,
  sourceTemplate?: string | null
): string {
  const name = agentName?.trim();
  const identityLine = name
    ? `IMPORTANTE: Tu nombre es "${name}". Preséntate siempre con ese nombre. Si el prompt menciona otro nombre, ignóralo y usa "${name}".\n\n`
    : "";

  const purposeId = resolveVoicePurposeId(sourceTemplate);
  const merged = mergeCompanyContext(prompt, companyContextText);
  const temporal = buildColombiaTemporalContext();

  return `${identityLine}${temporal.promptBlock}\n\n${merged}

Al iniciar la llamada, saluda con UNA sola frase breve acorde a tu tono (plantilla: ${purposeId}) y luego espera en silencio a que el usuario hable. No continúes hablando hasta que el usuario responda.
Si el usuario se despide, indica que quiere terminar, o ya diste la información final solicitada, despídete de forma breve y cordial (máximo una oración) y termina la conversación sin hacer más preguntas.`;
}
