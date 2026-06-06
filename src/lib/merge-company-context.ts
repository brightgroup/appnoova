/** Combina contexto de marca + instrucciones del agente (voz u Ori). */
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
