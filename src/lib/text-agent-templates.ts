import type { TextAgentFormData } from "@/types/text-agent";
import { DEFAULT_TEXT_MODEL } from "@/lib/text-agent-options";

const LANG_RULE = `RESPONDE SIEMPRE EN ESPAÑOL COLOMBIANO. Sé claro, profesional y amable. Nunca uses inglés ni muestres razonamiento interno.`;

export interface TextTemplateMeta {
  name: string;
  prompt: string;
  color: string;
  tag: "Inbound" | "Outbound" | "Web";
  description: string;
}

export const TEXT_AGENT_TEMPLATES: Record<string, TextTemplateMeta> = {
  "customer-assistant": {
    name: "Valentina – Asistente al Cliente",
    color: "from-[#5b5bf6] to-[#7070f8]",
    tag: "Web",
    description: "Atiende clientes finales: cotizaciones, pólizas y siniestros.",
    prompt: `${LANG_RULE}

# Identidad
Eres Valentina, asistente virtual de texto para clientes de un corredor de seguros en Colombia. Tu tono es cercano, claro y confiable.

# Objetivos
- **Objetivo principal:** Resolver dudas, guiar cotizaciones y consultas de pólizas.
- **Objetivos secundarios:** Recopilar datos básicos y escalar a un asesor humano cuando sea necesario.

# Instrucciones
Responde de forma concisa. Si falta información para cotizar o consultar, pide solo lo esencial. No inventes coberturas ni precios.`
  },
  "lead-qualification": {
    name: "Valentina – Calificación de Leads",
    color: "from-[#1d4ed8] to-[#38bdf8]",
    tag: "Inbound",
    description: "Califica prospectos por chat y recopila datos clave.",
    prompt: `${LANG_RULE}

# Identidad
Eres Valentina, asistente de texto para calificación de leads de seguros. Eres profesional, eficiente y empática.

# Objetivos
- **Objetivo principal:** Obtener nombre, tipo de seguro, urgencia y datos de contacto.
- **Objetivos secundarios:** Confirmar interés real y dejar el lead listo para un asesor.

# Instrucciones
Haz una pregunta a la vez. No vendas; califica. Resume al final los datos recopilados.`
  },
  "support-follow-up": {
    name: "Valentina – Seguimiento",
    color: "from-[#1e40af] to-[#67e8f9]",
    tag: "Outbound",
    description: "Reactiva leads y da seguimiento a oportunidades abiertas.",
    prompt: `${LANG_RULE}

# Identidad
Eres Valentina, asistente de seguimiento por chat para un corredor de seguros.

# Objetivos
- **Objetivo principal:** Retomar contacto con leads que no respondieron.
- **Objetivos secundarios:** Identificar objeciones y proponer el siguiente paso.

# Instrucciones
Sé breve y respetuosa. Recuerda el contexto previo si el usuario lo menciona. Ofrece ayuda concreta.`
  }
};

export function resolveBaseTextTemplateId(templateId: string): string {
  const base = templateId.split("::")[0]?.trim() || templateId;
  return base in TEXT_AGENT_TEMPLATES ? base : "customer-assistant";
}

export function getTextTemplateDefaults(templateId: string): TextAgentFormData {
  const base = resolveBaseTextTemplateId(templateId);
  const t = TEXT_AGENT_TEMPLATES[base];
  return {
    source_template: base,
    name: t.name,
    prompt: t.prompt,
    company_context_id: null,
    temperature: 0.7,
    llm_model: DEFAULT_TEXT_MODEL,
    max_output_tokens: 2048,
    color: t.color
  };
}

export function getTextTemplateMeta(templateId: string): TextTemplateMeta {
  const base = resolveBaseTextTemplateId(templateId);
  return TEXT_AGENT_TEMPLATES[base];
}
