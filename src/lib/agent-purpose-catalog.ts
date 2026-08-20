/** Propósitos de agente — sector-agnósticos (estilo Dapta) */

export type AgentChannel = "text" | "voice";

export interface AgentPurposeMeta {
  id: string;
  label: string;
  emoji: string;
  tag: "Inbound" | "Outbound" | "Web";
  description: string;
  stat: string;
  statColor: string;
  color: string;
  /** Código corto para el prompt operativo */
  purposeCode: string;
}

export const TEXT_AGENT_PURPOSES: AgentPurposeMeta[] = [
  {
    id: "lead-qualification",
    label: "Calificación de leads",
    emoji: "🎯",
    tag: "Inbound",
    description: "Califica prospectos por chat y recopila datos clave automáticamente.",
    stat: "+40% conversión",
    statColor: "text-[#38bdf8]",
    color: "from-[#1d4ed8] to-[#38bdf8]",
    purposeCode: "201",
  },
  {
    id: "sales-inquiries",
    label: "Consultas de ventas",
    emoji: "🛒",
    tag: "Inbound",
    description: "Responde preguntas de compra, productos y disponibilidad en tu canal digital.",
    stat: "Ventas 24/7",
    statColor: "text-[#99c9ff]",
    color: "from-[#0f7eff] to-[#3392ff]",
    purposeCode: "202",
  },
  {
    id: "customer-assistant",
    label: "Atención al cliente",
    emoji: "💬",
    tag: "Web",
    description: "Soporte, consultas frecuentes y escalado a un humano cuando haga falta.",
    stat: "Respuesta inmediata",
    statColor: "text-[#67e8f9]",
    color: "from-[#0e7490] to-[#67e8f9]",
    purposeCode: "203",
  },
  {
    id: "website-qa",
    label: "Asistente del sitio web",
    emoji: "💻",
    tag: "Web",
    description: "Responde preguntas sobre tu empresa, servicios y contenido del sitio.",
    stat: "FAQ automático",
    statColor: "text-[#99c9ff]",
    color: "from-[#4338ca] to-[#818cf8]",
    purposeCode: "204",
  },
  {
    id: "meeting-scheduling",
    label: "Agendar reuniones",
    emoji: "📅",
    tag: "Inbound",
    description: "Coordina citas, demos o llamadas según disponibilidad del equipo.",
    stat: "Menos fricción",
    statColor: "text-[#38bdf8]",
    color: "from-[#1e40af] to-[#38bdf8]",
    purposeCode: "205",
  },
  {
    id: "support-follow-up",
    label: "Seguimiento comercial",
    emoji: "📈",
    tag: "Outbound",
    description: "Reactiva leads sin respuesta y da seguimiento a oportunidades abiertas.",
    stat: "+30% reactivación",
    statColor: "text-[#67e8f9]",
    color: "from-[#1e40af] to-[#67e8f9]",
    purposeCode: "206",
  },
];

export const VOICE_AGENT_PURPOSES: AgentPurposeMeta[] = [
  {
    id: "lead-qualification",
    label: "Calificación de leads",
    emoji: "🎯",
    tag: "Outbound",
    description: "Llama a prospectos, califica intención y recopila datos clave.",
    stat: "+40% conversión",
    statColor: "text-[#38bdf8]",
    color: "from-[#1d4ed8] to-[#38bdf8]",
    purposeCode: "101",
  },
  {
    id: "policy-reminder",
    label: "Recordatorios y notificaciones",
    emoji: "🔔",
    tag: "Outbound",
    description: "Informa vencimientos, renovaciones, pagos o recordatorios importantes.",
    stat: "+65% respuesta",
    statColor: "text-[#00eaff]",
    color: "from-[#0369a1] to-[#00eaff]",
    purposeCode: "102",
  },
  {
    id: "follow-up",
    label: "Seguimiento comercial",
    emoji: "📈",
    tag: "Outbound",
    description: "Retoma contacto con leads y oportunidades sin respuesta.",
    stat: "+30% cierre",
    statColor: "text-[#67e8f9]",
    color: "from-[#1e40af] to-[#67e8f9]",
    purposeCode: "103",
  },
  {
    id: "customer-service",
    label: "Atención al cliente",
    emoji: "🎧",
    tag: "Inbound",
    description: "Resuelve consultas frecuentes y escala a un asesor humano si es necesario.",
    stat: "Menos espera",
    statColor: "text-[#99c9ff]",
    color: "from-[#0f7eff] to-[#3392ff]",
    purposeCode: "104",
  },
  {
    id: "meeting-scheduling",
    label: "Agendar reuniones",
    emoji: "📅",
    tag: "Inbound",
    description: "Coordina citas o demos por voz de forma natural y eficiente.",
    stat: "Agenda llena",
    statColor: "text-[#38bdf8]",
    color: "from-[#1e40af] to-[#38bdf8]",
    purposeCode: "105",
  },
];

export function getPurposeMeta(channel: AgentChannel, purposeId: string): AgentPurposeMeta {
  const list = channel === "text" ? TEXT_AGENT_PURPOSES : VOICE_AGENT_PURPOSES;
  return list.find(p => p.id === purposeId) ?? list[0];
}

export function resolvePurposeId(channel: AgentChannel, rawId: string): string {
  const base = rawId.split("::")[0]?.trim() || rawId;
  const list = channel === "text" ? TEXT_AGENT_PURPOSES : VOICE_AGENT_PURPOSES;
  if (list.some(p => p.id === base)) return base;
  // Alias legacy
  if (base === "renewal-reminder") return "policy-reminder";
  return channel === "text" ? "customer-assistant" : "lead-qualification";
}
