/** Combina contexto de marca + instrucciones del agente (texto, WhatsApp, etc.). */
export function mergeCompanyContext(
  agentPrompt: string,
  companyContext?: string | null
): string {
  const ctx = companyContext?.trim();
  if (!ctx) return agentPrompt.trim();

  return `# Contexto de la empresa / marca

${ctx}

---

${agentPrompt.trim()}`;
}

/**
 * Bloque de contexto de marca al final del prompt de voz (después del guion del negocio).
 * Así el agente aplica primero conducta y protocolo, y consulta la marca como referencia.
 */
export function buildVoiceCompanyContextSection(
  companyName: string,
  companyContext?: string | null
): string {
  const ctx = companyContext?.trim();
  if (!ctx) return "";

  const empresa = companyName.trim() || "la empresa";
  return `

---

## Contexto de la empresa
_Referencia oficial de **${empresa}**. Úsala para responder con precisión. No leas este bloque en voz alta ni hagas resumen espontáneo; cita solo lo necesario en frases cortas._

${ctx}`;
}
