/** Resultados AMD estándar de Telnyx (call.machine.detection.ended). */
export type TelnyxAmdStandardResult =
  | "human"
  | "machine"
  | "not_sure"
  | "fax_detected"
  | "silence";

/** Resultados AMD premium de Telnyx (call.machine.premium.detection.ended). */
export type TelnyxAmdPremiumResult =
  | "human_residence"
  | "human_business"
  | "machine"
  | "silence"
  | "fax_detected"
  | "not_sure";

export type OutboundCallOutcome = "voicemail" | "no_answer" | "busy" | "failed" | "connected";

export function isMachineAmdResult(result: string): boolean {
  const r = result.toLowerCase();
  return r === "machine" || r === "fax_detected" || r === "silence";
}

export function isHumanAmdResult(result: string): boolean {
  const r = result.toLowerCase();
  return (
    r === "human" ||
    r === "human_residence" ||
    r === "human_business" ||
    r === "not_sure" // Telnyx recomienda tratar not_sure como humano
  );
}

export function outcomeStatusLabel(outcome: OutboundCallOutcome): string {
  switch (outcome) {
    case "voicemail":
      return "Buzón de voz";
    case "no_answer":
      return "No contestada";
    case "busy":
      return "Línea ocupada";
    case "failed":
      return "Error de conexión";
    case "connected":
      return "En llamada";
    default:
      return "Llamada";
  }
}

/** Etiqueta de resultado para llamadas gestionadas (campaña, CRM, prueba). */
export function managedOutboundOutcomeLabel(
  kind: "test" | "crm" | "campaign",
  outcome: OutboundCallOutcome
): string {
  const base = outcomeStatusLabel(outcome);
  switch (kind) {
    case "campaign":
      return `Campaña — ${base}`;
    case "crm":
      return `Llamada IA — ${base}`;
    default:
      return `Prueba — ${base}`;
  }
}

export function mapHangupCauseToOutcome(cause: string): OutboundCallOutcome {
  const c = cause.toLowerCase();
  if (c.includes("busy")) return "busy";
  if (c.includes("no_answer") || c.includes("no answer") || c.includes("timeout")) return "no_answer";
  if (c.includes("reject") || c.includes("failed") || c.includes("unallocated")) return "failed";
  return "no_answer";
}

export function outcomeSummary(
  outcome: OutboundCallOutcome,
  phone: string,
  agentName?: string
): string {
  const who = agentName ? `Agente ${agentName}` : "El agente";
  switch (outcome) {
    case "voicemail":
      return `Llamada a ${phone} fue a buzón de voz. ${who} no se activó.`;
    case "no_answer":
      return `Llamada a ${phone} — no contestada.`;
    case "busy":
      return `Llamada a ${phone} — línea ocupada.`;
    case "failed":
      return `Llamada a ${phone} — no se pudo conectar.`;
    default:
      return `Llamada a ${phone}.`;
  }
}
