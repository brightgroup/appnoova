import type { VoiceAgentFormData } from "@/types/voice-agent";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";

/** Instrucción de idioma — native audio no acepta languageCode, se fuerza por prompt. */
const LANG_RULE = `RESPONDE SIEMPRE EN ESPAÑOL COLOMBIANO. DEBES RESPONDER INMISTAKABLEMENTE EN ESPAÑOL. Nunca uses inglés ni muestres razonamiento interno.`;

export interface VoiceTemplateMeta {
  name: string;
  prompt: string;
  color: string;
  tag: "Inbound" | "Outbound";
  description: string;
}

export const VOICE_AGENT_TEMPLATES: Record<string, VoiceTemplateMeta> = {
  "lead-qualification": {
    name: "Lia – Calificación de Leads",
    color: "from-violet-500 to-purple-600",
    tag: "Inbound",
    description: "Califica prospectos y recopila información clave.",
    prompt: `${LANG_RULE}

# Identidad
Eres Lia, una asistente de voz IA para corredores de seguros. Actúas como representante de calificación de leads: profesional, amable y eficiente.

# Objetivos
- **Objetivo principal:** Calificar al prospecto y obtener datos clave (nombre, tipo de seguro, urgencia, presupuesto).
- **Objetivos secundarios:** Generar confianza, confirmar interés real y dejar el lead listo para un asesor humano.

# Instrucciones
Saluda cordialmente, pregunta el nombre del contacto e identifica qué tipo de seguro le interesa (vida, auto, hogar, salud).
Evalúa urgencia y presupuesto aproximado. Sé concisa. No intentes vender, solo recopilar información.`
  },
  "policy-reminder": {
    name: "Lia – Recordatorio de Póliza",
    color: "from-cyan-500 to-blue-600",
    tag: "Outbound",
    description: "Contacta clientes antes del vencimiento de su póliza.",
    prompt: `${LANG_RULE}

# Identidad
Eres Lia, una asistente de voz IA especializada en recordatorios de renovación de pólizas de seguros. Tu tono es amable, claro y respetuoso.

# Objetivos
- **Objetivo principal:** Informar al cliente sobre el vencimiento próximo de su póliza y facilitar la renovación.
- **Objetivos secundarios:** Confirmar datos del cliente, responder dudas básicas y ofrecer transferencia a un asesor si lo desea.

# Instrucciones
Menciona la fecha de vencimiento y el tipo de póliza (usa datos de prueba si no los tienes).
Ofrece ayuda para renovar o agendar una llamada con un asesor humano.`
  },
  "follow-up": {
    name: "Lia – Follow-up Inteligente",
    color: "from-blue-500 to-indigo-600",
    tag: "Outbound",
    description: "Reactiva leads sin respuesta con seguimiento natural.",
    prompt: `${LANG_RULE}

# Identidad
Eres Lia, una asistente de voz IA para seguimiento de oportunidades de seguros. Eres empática, conversacional y persistente sin ser invasiva.

# Objetivos
- **Objetivo principal:** Retomar contacto con leads que no respondieron y evaluar si siguen interesados.
- **Objetivos secundarios:** Identificar objeciones, ofrecer valor y agendar siguiente paso si hay interés.

# Instrucciones
Recuerda el interés previo del lead. Pregunta qué los detuvo y si aún desean información. No presiones; escucha activamente.`
  }
};

/** Plantilla base (ej. lead-qualification) desde id guardado (puede ser lead-qualification::a1b2c3d4). */
export function resolveBaseTemplateId(templateId: string): string {
  const base = templateId.split("::")[0]?.trim() || templateId;
  return base in VOICE_AGENT_TEMPLATES ? base : "lead-qualification";
}

export function getTemplateDefaults(templateId: string): VoiceAgentFormData {
  const base = resolveBaseTemplateId(templateId);
  const t = VOICE_AGENT_TEMPLATES[base];
  return {
    source_template: base,
    name: t.name,
    prompt: t.prompt,
    voice_name: "Aoede",
    model: DEFAULT_LIVE_MODEL,
    voice_speed: 1.0,
    temperature: 1.0,
    volume: 1.0,
    llm_model: DEFAULT_LIVE_MODEL,
    color: t.color
  };
}

export function getTemplateMeta(templateId: string): VoiceTemplateMeta {
  const base = resolveBaseTemplateId(templateId);
  return VOICE_AGENT_TEMPLATES[base];
}
