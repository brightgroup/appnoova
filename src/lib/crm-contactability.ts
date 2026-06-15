import { isWhatsAppSessionOpen } from "@/lib/whatsapp/session-window";
import type {
  CrmContact,
  CrmContactActions,
  CrmSuppression,
  VentanaWaEstado
} from "@/types/crm";

export function parseSupresiones(raw: unknown): CrmSuppression[] {
  if (!Array.isArray(raw)) return [];
  const allowed: CrmSuppression[] = ["no_whatsapp", "no_llamadas", "no_email"];
  return raw.filter((v): v is CrmSuppression => allowed.includes(v as CrmSuppression));
}

/** Calcula ventana WhatsApp según spec §3.1 */
export function computeVentanaWaEstado(ultimoInboundWa: string | null | undefined): VentanaWaEstado {
  if (!ultimoInboundWa) return "sin_conversacion";
  if (isWhatsAppSessionOpen(ultimoInboundWa)) return "abierta";
  return "requiere_plantilla";
}

export function hasSuppression(contact: Pick<CrmContact, "supresiones">, key: CrmSuppression): boolean {
  return contact.supresiones.includes(key);
}

export function hasValidContactChannel(contact: Pick<CrmContact, "whatsapp" | "telefono" | "email" | "estado_whatsapp" | "estado_email">): boolean {
  if (contact.whatsapp && contact.estado_whatsapp !== "invalido" && contact.estado_whatsapp !== "rebotado") return true;
  if (contact.telefono) return true;
  if (contact.email && contact.estado_email !== "invalido" && contact.estado_email !== "rebotado") return true;
  return false;
}

export function computeContactActions(contact: CrmContact): CrmContactActions {
  const ventana = contact.ventana_wa_estado;
  const waBlocked = hasSuppression(contact, "no_whatsapp");
  const callBlocked = hasSuppression(contact, "no_llamadas");

  let whatsapp: CrmContactActions["whatsapp"] = { allowed: false, mode: null, reason: "Sin conversación WhatsApp" };
  if (waBlocked) {
    whatsapp = { allowed: false, mode: null, reason: "Contacto solicitó no recibir WhatsApp" };
  } else if (ventana === "sin_conversacion") {
    whatsapp = { allowed: false, mode: null, reason: "El contacto debe escribir primero por WhatsApp" };
  } else if (ventana === "abierta") {
    whatsapp = { allowed: true, mode: "session", reason: null };
  } else {
    whatsapp = { allowed: true, mode: "template", reason: "Ventana de 24 h cerrada — solo plantilla aprobada" };
  }

  let call: CrmContactActions["call"];
  if (callBlocked) {
    call = { allowed: false, reason: "Contacto solicitó no recibir llamadas" };
  } else if (!contact.telefono) {
    call = { allowed: false, reason: "Sin teléfono registrado" };
  } else if (contact.tipo_relacion === "prospecto" && !contact.ultimo_inbound_wa) {
    call = { allowed: false, reason: "No se permiten llamadas en frío a prospectos" };
  } else {
    call = { allowed: true, reason: null };
  }

  return {
    whatsapp,
    call,
    can_create_lead: true,
    can_open_inbox: Boolean(contact.inbox_conversation_id)
  };
}

export const VENTANA_WA_LABELS: Record<VentanaWaEstado, string> = {
  abierta: "Ventana abierta (24 h)",
  requiere_plantilla: "Requiere plantilla",
  sin_conversacion: "Sin conversación"
};

export const TIPO_RELACION_LABELS: Record<CrmContact["tipo_relacion"], string> = {
  prospecto: "Prospecto",
  cliente: "Cliente",
  referido: "Referido",
  inactivo: "Inactivo"
};

export const FUENTE_ORIGEN_OPTIONS = [
  { value: "anuncio_meta", label: "Anuncio Meta" },
  { value: "web", label: "Web" },
  { value: "referido", label: "Referido" },
  { value: "recepcion_ia", label: "Recepción IA" },
  { value: "base", label: "Base de datos" },
  { value: "otro", label: "Otro" }
] as const;
