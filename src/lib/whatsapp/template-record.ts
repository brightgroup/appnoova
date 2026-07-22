import type {
  WhatsAppTemplateCategory,
  WhatsAppTemplateProvider,
  WhatsAppTemplateRecord,
  WhatsAppTemplateStatus
} from "@/types/whatsapp-template";

function parseLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => String(v).trim()).filter(Boolean);
}

function normalizeStatus(raw: string): WhatsAppTemplateStatus {
  if (raw === "active") return "approved";
  if (
    raw === "draft" ||
    raw === "pending_approval" ||
    raw === "approved" ||
    raw === "rejected" ||
    raw === "inactive"
  ) {
    return raw;
  }
  return "approved";
}

function normalizeProvider(raw: string): WhatsAppTemplateProvider {
  if (raw === "dialog360") return "dialog360";
  return "twilio";
}

export function toWhatsAppTemplateRecord(raw: Record<string, unknown>): WhatsAppTemplateRecord {
  const category = String(raw.category ?? "utility");
  return {
    id: String(raw.id),
    whatsapp_channel_id: String(raw.whatsapp_channel_id),
    user_id: String(raw.user_id),
    provider: normalizeProvider(String(raw.provider ?? "twilio")),
    twilio_content_sid: raw.twilio_content_sid ? String(raw.twilio_content_sid) : null,
    template_name: String(raw.template_name),
    category:
      category === "marketing" || category === "authentication"
        ? category
        : "utility",
    language: String(raw.language ?? "es"),
    body_preview: String(raw.body_preview ?? ""),
    body_source: raw.body_source ? String(raw.body_source) : null,
    variable_labels: parseLabels(raw.variable_labels),
    variable_examples: parseLabels(raw.variable_examples),
    status: normalizeStatus(String(raw.status ?? "approved")),
    rejection_reason: raw.rejection_reason ? String(raw.rejection_reason) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

/** Extrae nombres de variables {{nombre}} en orden de aparición. */
export function extractNamedVariables(body: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const re = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Convierte {{contact_name}} → {{1}} para Twilio. */
export function namedBodyToTwilio(body: string, variableNames: string[]): string {
  let out = body;
  variableNames.forEach((name, i) => {
    const re = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi");
    out = out.replace(re, `{{${i + 1}}}`);
  });
  return out;
}

/** Convierte {{1}} → {{contact_name}} para edición. */
export function twilioBodyToNamed(body: string, variableNames: string[]): string {
  let out = body;
  variableNames.forEach((name, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), `{{${name}}}`);
    out = out.replace(new RegExp(`\\{\\{${i + 1}[^}]*\\}\\}`, "g"), `{{${name}}}`);
  });
  return out;
}

export function resolveBodySource(template: WhatsAppTemplateRecord): string {
  if (template.body_source) return template.body_source;
  return twilioBodyToNamed(template.body_preview, template.variable_labels);
}

export function normalizeTemplateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function isValidTemplateName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

/** Rellena {{1}}, {{2}}… con valores en orden. */
export function renderTemplatePreview(
  bodyPreview: string,
  values: string[]
): string {
  let out = bodyPreview;
  values.forEach((val, i) => {
    const n = i + 1;
    out = out.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), val.trim());
    out = out.replace(new RegExp(`\\{\\{${n}[^}]*\\}\\}`, "g"), val.trim());
  });
  return out;
}

/** Preview con variables nombradas y ejemplos. */
export function renderNamedTemplatePreview(
  bodySource: string,
  variableNames: string[],
  examples: string[]
): string {
  const twilioBody = namedBodyToTwilio(bodySource, variableNames);
  return renderTemplatePreview(twilioBody, examples);
}

/** Twilio ContentVariables: claves "1", "2", … */
export function buildContentVariables(values: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  values.forEach((val, i) => {
    vars[String(i + 1)] = val.trim();
  });
  return vars;
}

export function normalizeContentSid(sid: string): string {
  return sid.trim().toUpperCase();
}

export function isValidContentSid(sid: string): boolean {
  return /^HX[a-f0-9]{32}$/i.test(sid.trim());
}

export function twilioCategoryLabel(category: WhatsAppTemplateCategory): string {
  if (category === "marketing") return "MARKETING";
  if (category === "authentication") return "AUTHENTICATION";
  return "UTILITY";
}

export function templateStatusLabel(status: WhatsAppTemplateStatus): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "pending_approval":
      return "En revisión";
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    case "inactive":
      return "Inactiva";
    default:
      return status;
  }
}

export function templateStatusColor(status: WhatsAppTemplateStatus): string {
  switch (status) {
    case "draft":
      return "text-gray-400 bg-gray-500/10";
    case "pending_approval":
      return "text-amber-300 bg-amber-500/10";
    case "approved":
      return "text-emerald-300 bg-emerald-500/10";
    case "rejected":
      return "text-red-300 bg-red-500/10";
    case "inactive":
      return "text-gray-500 bg-gray-500/10";
    default:
      return "text-gray-400 bg-gray-500/10";
  }
}

export interface WhatsAppTemplatePreset {
  label: string;
  hint: string;
  /** Nota adicional mostrada en el editor tras elegir este preset (aclaraciones de uso). */
  note?: string;
  template_name: string;
  category: WhatsAppTemplateCategory;
  body_source: string;
  variable_labels: string[];
  variable_examples: string[];
}

export const PMV_BROKER_TEMPLATE_PRESETS: WhatsAppTemplatePreset[] = [
  {
    label: "Seguimiento de cotización",
    hint: "Reactivar a un cliente que dejó una cotización a medias.",
    template_name: "seguimiento_cotizacion",
    category: "utility",
    body_source:
      "Hola {{contact_name}}, soy de {{company_name}}. ¿Sigues interesado en la cotización de tu seguro? Escríbenos aquí y te ayudamos.",
    variable_labels: ["contact_name", "company_name"],
    variable_examples: ["María", "Seguros Noova"]
  },
  {
    label: "Recordatorio de documentos",
    hint: "Pedirle a un cliente un documento pendiente para avanzar su trámite.",
    template_name: "recordatorio_documentos",
    category: "utility",
    body_source:
      "Hola {{contact_name}}, para continuar con tu póliza necesitamos {{document_name}}. Puedes enviarlo por este chat.",
    variable_labels: ["contact_name", "document_name"],
    variable_examples: ["Carlos", "copia de cédula"]
  },
  {
    label: "Notificación al equipo (Noova)",
    hint: "Para que tus agentes IA avisen a tu equipo por WhatsApp (agendamientos, intención de compra, derivación a asesor).",
    note:
      "Esta MISMA plantilla, una vez aprobada, sirve para los 3 eventos de notificación (cita agendada, intención de compra, derivación a asesor) — eliges cuáles activar y en cuáles usarla desde la config de cada agente. El ejemplo de abajo (una cita) es solo uno de los tres posibles; el contenido real cambia según qué evento haya ocurrido, Noova lo arma automáticamente.",
    template_name: "notificacion_equipo_noova",
    category: "utility",
    body_source:
      "🔔 Notificación automática de tu asistente Noova\n\n{{mensaje}}\n\nEste aviso se generó solo, sin intervención humana.",
    variable_labels: ["mensaje"],
    variable_examples: [
      "Cita agendada — Juan Pérez, martes 22 de julio, 10:00 am. Motivo: asesoría inicial."
    ]
  }
];
