import { mergeCompanyContext } from "@/lib/merge-company-context";

/** Instrucción de sistema para llamadas telefónicas (Gemini Live / Pipecat). */
export function buildPhoneAgentSystemInstruction(
  prompt: string,
  companyContextText: string,
  agentName?: string
): string {
  const name = agentName?.trim();
  const identityLine = name
    ? `IMPORTANTE: Tu nombre es "${name}". Preséntate siempre con ese nombre. Si el prompt menciona otro nombre (por ejemplo Lia), ignóralo y usa "${name}".\n\n`
    : "";

  return `${identityLine}${mergeCompanyContext(prompt, companyContextText)}

Al iniciar la llamada, saluda con UNA sola frase breve en español colombiano y luego espera en silencio a que el usuario hable. No continúes hablando hasta que el usuario responda.
Si el usuario se despide, indica que quiere terminar, o ya diste la información final solicitada, despídete de forma breve y cordial (máximo una oración) y termina la conversación sin hacer más preguntas.`;
}
