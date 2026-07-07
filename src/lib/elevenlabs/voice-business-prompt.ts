import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { buildVoiceInteractionSteps } from "@/lib/voice-purpose-flows";
import { buildOperationalConductSection } from "@/lib/elevenlabs/voice-operational-template";

/** Guía en el editor del agente. */
export const VOICE_AGENT_PROMPT_GUIDE = `Personaliza las secciones 3 (protocolo) y 4 (restricciones). Las secciones 1–2 son estándar.
Al llamar, el contexto de marca de la sección asignada se añade automáticamente al final del prompt.`;

/** Guía en campañas. */
export const VOICE_BUSINESS_PROMPT_GUIDE = `Personaliza protocolo y restricciones del negocio. La conducta operativa y el contexto de marca (al final) se aplican solos en cada llamada.`;

export interface VoiceBusinessPromptInput {
  purposeId: string;
  agentName: string;
  companyName: string;
  extraInstructions?: string;
}

function purposeObjective(purposeId: string, companyName: string): string {
  switch (purposeId) {
    case "lead-qualification":
      return "Calificar prospectos por teléfono, identificar necesidad, urgencia y datos de contacto.";
    case "customer-service":
      return "Resolver dudas frecuentes, orientar al cliente y escalar a un asesor humano cuando sea necesario.";
    case "meeting-scheduling":
      return "Agendar citas, demos o llamadas confirmando fecha, hora y datos de contacto.";
    case "follow-up":
      return "Retomar contacto con leads u oportunidades sin respuesta y proponer el siguiente paso.";
    case "policy-reminder":
      return "Informar recordatorios, vencimientos o notificaciones importantes y facilitar la acción requerida.";
    default:
      return `Apoyar a clientes y prospectos de ${companyName} de forma profesional.`;
  }
}

function businessRestrictionsTemplate(companyName: string): string {
  return `- Cumple políticas comerciales y legales de **${companyName}**; no prometas lo que no esté en el contexto de marca.
- No compartas información de otros clientes ni datos internos de la empresa.
- No insistas más de dos veces si el cliente dice que no está interesado o pide no ser contactado.
- Horarios, canales alternos (WhatsApp, correo) y excepciones: solo si están en el contexto de marca.
- _(Agrega aquí reglas propias: productos que no se venden por teléfono, montos máximos, zonas de cobertura, etc.)_`;
}

/**
 * Plantilla al crear un agente de voz.
 * El contexto de marca no va aquí: se inyecta al final en cada llamada (ver buildVoiceCompanyContextSection).
 */
export function buildDefaultVoiceBusinessPrompt(input: VoiceBusinessPromptInput): string {
  const agentName = input.agentName.trim() || "Asistente";
  const companyName = input.companyName.trim() || "Mi empresa";
  const purpose = getPurposeMeta("voice", input.purposeId);
  const objective = purposeObjective(input.purposeId, companyName);
  const operational = buildOperationalConductSection(input.purposeId, companyName);
  const protocol = buildVoiceInteractionSteps(input.purposeId, agentName, companyName);
  const extra = input.extraInstructions?.trim()
    ? `\n\n## Instrucciones adicionales\n${input.extraInstructions.trim()}`
    : "";

  return `# Agente de voz — ${purpose.label}

---

## 1. Conducta operativa
_Reglas de llamada estándar para todos los agentes. Evita quitar este bloque._

${operational}

---

## 2. Identidad y objetivo
Eres **${agentName}**, agente de voz de **${companyName}**.
**Objetivo de esta llamada:** ${objective}

---

## 3. Protocolo de conversación ← personaliza
_Guion sugerido para ${purpose.label}. Edita pasos, preguntas y flujo según tu operación._

${protocol}

---

## 4. Restricciones del negocio ← personaliza
_Límites comerciales y reglas específicas de ${companyName}._

${businessRestrictionsTemplate(companyName)}${extra}`;
}
