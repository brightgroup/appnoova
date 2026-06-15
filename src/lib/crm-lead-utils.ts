import type {
  CrmLead,
  CrmLeadOutcome,
  CrmLeadTemperatura,
  CrmMotivoPerdida,
  CrmProximaAccionEstado,
  CrmProximaAccionTipo
} from "@/types/crm";

export const STALLED_LEAD_DAYS = 5;

export const CRM_MOTIVO_PERDIDA_LABELS: Record<CrmMotivoPerdida, string> = {
  precio: "Precio",
  no_respondio: "No respondió",
  compro_otro: "Compró con otro",
  no_era_momento: "No era el momento",
  sin_presupuesto: "Sin presupuesto",
  datos_incompletos: "Datos incompletos",
  otro: "Otro"
};

export const CRM_PROXIMA_ACCION_TIPO_LABELS: Record<CrmProximaAccionTipo, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  email: "Email",
  cotizacion_ori: "Cotización ORI",
  tarea_asesor: "Tarea asesor",
  esperar: "Esperar"
};

export const CRM_TEMPERATURA_LABELS: Record<CrmLeadTemperatura, string> = {
  frio: "Frío",
  tibio: "Tibio",
  caliente: "Caliente"
};

export const DEFAULT_PROXIMA_ACCION = "Dar seguimiento al prospecto";

export function scoreToTemperatura(score: number | null | undefined): CrmLeadTemperatura | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 70) return "caliente";
  if (score >= 40) return "tibio";
  return "frio";
}

export function computeDiasEnEtapa(stageEnteredAt: string | null | undefined): number {
  if (!stageEnteredAt) return 0;
  const entered = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(entered)) return 0;
  return Math.max(0, Math.floor((Date.now() - entered) / (1000 * 60 * 60 * 24)));
}

export function enrichCrmLead(lead: CrmLead): CrmLead {
  const dias_en_etapa = computeDiasEnEtapa(lead.stage_entered_at);
  const is_stalled = lead.outcome === "open" && dias_en_etapa >= STALLED_LEAD_DAYS;
  const is_overdue =
    lead.outcome === "open" &&
    lead.proxima_accion_estado === "pendiente" &&
    Boolean(lead.proxima_accion_fecha) &&
    new Date(lead.proxima_accion_fecha!).getTime() < Date.now();

  const temperatura =
    lead.temperatura ?? scoreToTemperatura(lead.score) ?? null;

  return {
    ...lead,
    dias_en_etapa,
    is_stalled,
    is_overdue,
    temperatura
  };
}

export function validateLeadPayload(input: {
  outcome?: CrmLeadOutcome;
  contact_id?: string | null;
  proxima_accion?: string | null;
  proxima_accion_fecha?: string | null;
  motivo_perdida?: CrmMotivoPerdida | null;
  isCreate?: boolean;
}): string | null {
  if (input.isCreate && !input.contact_id) {
    return "Selecciona un contacto para el lead";
  }
  const outcome = input.outcome ?? "open";
  if (outcome === "open") {
    if (!input.proxima_accion?.trim()) {
      return "Los leads abiertos requieren una próxima acción";
    }
    if (!input.proxima_accion_fecha) {
      return "Los leads abiertos requieren fecha de próxima acción";
    }
  }
  if (outcome === "lost" && !input.motivo_perdida) {
    return "Indica el motivo de pérdida";
  }
  return null;
}

export function formatProximaAccionFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) return "Hoy";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return "Mañana";
  if (d.getTime() < now.getTime()) return "Vencida";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function leadFromContactDefaults(contact: {
  id: string;
  name: string;
  categorias_interes?: string[];
  fuente_origen?: string | null;
  source?: string | null;
  asesor_asignado?: string | null;
  inbox_conversation_id?: string | null;
}): Partial<CrmLead> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return {
    contact_id: contact.id,
    title: `Oportunidad — ${contact.name}`,
    categoria_interes: contact.categorias_interes?.[0] ?? null,
    source: contact.fuente_origen ?? contact.source ?? null,
    asesor_responsable: contact.asesor_asignado ?? null,
    inbox_conversation_id: contact.inbox_conversation_id ?? null,
    proxima_accion: contact.inbox_conversation_id
      ? "Responder en WhatsApp"
      : DEFAULT_PROXIMA_ACCION,
    proxima_accion_fecha: tomorrow.toISOString(),
    proxima_accion_tipo: contact.inbox_conversation_id ? "whatsapp" : "tarea_asesor",
    proxima_accion_estado: "pendiente",
    outcome: "open"
  };
}
