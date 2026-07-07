import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { buildVoiceInteractionSteps } from "@/lib/voice-purpose-flows";

/** Texto de ayuda en UI: qué va en el prompt del agente vs qué maneja Noova. */
export const VOICE_BUSINESS_PROMPT_GUIDE = `Escribe solo protocolo y reglas de tu negocio (identidad del rol, pasos de la llamada, restricciones).
El contexto de marca, idioma, turnos, apertura/cierre y acento los añade Noova automáticamente desde la marca asignada al agente.`;

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

function businessRestrictions(companyName: string): string {
  return `## Restricciones del negocio
- Usa solo información del contexto de marca de **${companyName}** (productos, precios, políticas); no inventes datos.
- No solicites datos sensibles innecesarios (documentos completos, claves, OTP).
- Si el cliente pide hablar con un humano o el caso supera tu alcance, ofrece transferencia o callback con un asesor.
- Respeta objeciones: no insistas más de dos veces si dice que no está interesado.`;
}

/**
 * Prompt corto solo con contenido de negocio (identidad, protocolo, reglas).
 * La plataforma añade idioma, turnos, apertura/cierre y acento en sync ElevenLabs.
 */
export function buildDefaultVoiceBusinessPrompt(input: VoiceBusinessPromptInput): string {
  const agentName = input.agentName.trim() || "Asistente";
  const companyName = input.companyName.trim() || "Mi empresa";
  const purpose = getPurposeMeta("voice", input.purposeId);
  const objective = purposeObjective(input.purposeId, companyName);
  const protocol = buildVoiceInteractionSteps(input.purposeId, agentName, companyName);
  const extra = input.extraInstructions?.trim()
    ? `\n## Instrucciones adicionales\n${input.extraInstructions.trim()}`
    : "";

  return `## Identidad
Eres **${agentName}**, agente de voz de **${companyName}**.
**Objetivo:** ${objective}
**Tipo de agente:** ${purpose.label}

## Protocolo de la llamada
${protocol}

${businessRestrictions(companyName)}${extra}`;
}
