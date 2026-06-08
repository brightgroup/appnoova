import { mergeCompanyContext } from "@/lib/merge-company-context";

/** Instrucción de sistema para llamadas telefónicas (Gemini Live / Pipecat). */
export function buildPhoneAgentSystemInstruction(
  prompt: string,
  companyContextText: string
): string {
  return `${mergeCompanyContext(prompt, companyContextText)}

Al iniciar la llamada, saluda con UNA sola frase breve en español colombiano y luego espera en silencio a que el usuario hable. No continúes hablando hasta que el usuario responda.
Si el usuario se despide o indica que quiere terminar la conversación, despídete de forma breve y cordial (máximo una oración).`;
}
