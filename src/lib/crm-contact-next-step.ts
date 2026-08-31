import type { CrmContact, CrmContactNextStep, CrmLead } from "@/types/crm";

export function computeContactNextStep(input: {
  contact: CrmContact;
  openLeads: CrmLead[];
}): CrmContactNextStep | null {
  const { contact, openLeads } = input;

  if (contact.ventana_wa_estado === "abierta" && contact.inbox_conversation_id) {
    return {
      message: "Ventana WhatsApp abierta — continúa la conversación ahora.",
      action: "inbox",
      href: `/dashboard/inbox?id=${contact.inbox_conversation_id}`
    };
  }

  if (contact.ventana_wa_estado === "requiere_plantilla" && contact.inbox_conversation_id) {
    return {
      message: "Sin actividad reciente — reactiva con plantilla aprobada.",
      action: "template",
      href: `/dashboard/inbox?id=${contact.inbox_conversation_id}`
    };
  }

  if (openLeads.length > 0) {
    const lead = openLeads[0];
    return {
      message: `Lead abierto «${lead.title}»${lead.stage?.name ? ` — ${lead.stage.name}` : ""}.`,
      action: "lead",
      href: `/dashboard/crm/leads/${lead.id}`
    };
  }

  if (!contact.whatsapp && !contact.telefono && !contact.email) {
    return {
      message: "Agrega al menos un canal de contacto para habilitar acciones.",
      action: "edit"
    };
  }

  if (contact.tipo_relacion === "prospecto" && contact.ventana_wa_estado === "sin_conversacion") {
    return {
      message: "Prospecto sin conversación — espera inbound de WhatsApp o crea un lead.",
      action: "lead",
      href: `/dashboard/crm/leads/nuevo?contact_id=${contact.id}`
    };
  }

  return null;
}
