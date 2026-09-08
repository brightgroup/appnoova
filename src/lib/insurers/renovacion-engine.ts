/**
 * Núcleo de envío de un aviso de renovación — compartido entre el cron
 * (src/app/api/cron/seguros-renovaciones/route.ts) y el botón manual
 * "Enviar aviso ahora" (src/app/api/seguros/renovaciones/[polizaId]/enviar),
 * para no duplicar la lógica de opt-out/billing/plantilla en dos lugares.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp/send-transport";
import { hasSuppression } from "@/lib/crm-contactability";
import { toCrmContact } from "@/lib/crm-record";
import { toE164 } from "@/lib/telephony/e164";
import { checkBillingForOrg, recordUsageSafe } from "@/lib/billing/meter";
import { registrarAviso, type RenovacionAvisoRecord } from "@/lib/insurers/renovacion-avisos-db";
import type { PolizaRecord } from "@/lib/insurers/polizas-db";

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long" });
}

export type EnviarAvisoResult =
  | { estado: "enviado" }
  | { estado: "omitido_optout" | "sin_telefono" }
  | { estado: "fallido"; error: string }
  | { estado: "bloqueado_billing" | "plantilla_no_lista" };

/**
 * Envía (o registra por qué no se envía) el aviso de un hito para una
 * póliza puntual. No verifica si ya existe un aviso para ese hito — quien
 * llama decide si eso importa (el cron sí lo checa antes de invocar esta
 * función; el envío manual deja que el unique(poliza_id, dias_aviso) de la
 * tabla sea la última palabra).
 */
export async function enviarAvisoPoliza(
  db: SupabaseClient,
  params: {
    organizationId: string;
    poliza: PolizaRecord;
    diasAviso: number;
    channelRow: Record<string, unknown>;
    templateRow: Record<string, unknown>;
  }
): Promise<EnviarAvisoResult> {
  const { organizationId, poliza, diasAviso, channelRow, templateRow } = params;

  const { data: contactRow } = await db.from("crm_contacts").select("*").eq("id", poliza.contactId).maybeSingle();
  const contact = contactRow ? toCrmContact(contactRow) : null;

  if (!contact) {
    await registrarAviso(db, {
      organizationId,
      polizaId: poliza.id,
      contactId: poliza.contactId,
      diasAviso,
      phoneE164: null,
      estado: "sin_telefono",
      error: "Contacto no encontrado"
    });
    return { estado: "sin_telefono" };
  }

  if (hasSuppression(contact, "no_whatsapp")) {
    await registrarAviso(db, {
      organizationId,
      polizaId: poliza.id,
      contactId: poliza.contactId,
      diasAviso,
      phoneE164: null,
      estado: "omitido_optout"
    });
    return { estado: "omitido_optout" };
  }

  const phoneE164 = toE164(contact.whatsapp || contact.telefono || contact.phone || "");
  if (!phoneE164) {
    await registrarAviso(db, {
      organizationId,
      polizaId: poliza.id,
      contactId: poliza.contactId,
      diasAviso,
      phoneE164: null,
      estado: "sin_telefono"
    });
    return { estado: "sin_telefono" };
  }

  const billing = await checkBillingForOrg(db, organizationId);
  if (!billing.allowed) {
    // No se registra el aviso a propósito: se deja libre para reintentar
    // (el cron o el botón manual) en vez de gastar el slot único del hito.
    console.error(`[seguros-renovaciones] facturación bloqueada org=${organizationId} reason=${billing.reason}`);
    return { estado: "bloqueado_billing" };
  }

  const channel = toWhatsAppChannelRecord(channelRow);
  const template = toWhatsAppTemplateRecord(templateRow);
  if (!template.twilio_content_sid || !["approved", "active"].includes(template.status)) {
    console.error(`[seguros-renovaciones] plantilla no lista org=${organizationId} template=${template.id}`);
    return { estado: "plantilla_no_lista" };
  }

  const valuesByLabel: Record<string, string> = {
    contact_name: contact.name,
    nombre: contact.name,
    ramo: poliza.ramo,
    aseguradora: poliza.aseguradora,
    numero_poliza: poliza.numeroPoliza ?? "",
    vence_el: poliza.vigenciaHasta ? formatFechaLarga(poliza.vigenciaHasta) : "",
    dias_restantes: String(diasAviso),
    prima: poliza.prima != null ? String(poliza.prima) : ""
  };
  const contentVariables: Record<string, string> = {};
  template.variable_labels.forEach((label, i) => {
    contentVariables[String(i + 1)] = valuesByLabel[label] ?? "";
  });

  try {
    await sendWhatsAppTemplateMessage({ channel, toE164: phoneE164, contentSid: template.twilio_content_sid, contentVariables });
    await recordUsageSafe({
      db,
      organizationId,
      eventType: "whatsapp_manual",
      twilioMessages: 1,
      provider: "twilio",
      referenceType: "seguros_renovacion",
      referenceId: poliza.id
    });
    await registrarAviso(db, {
      organizationId,
      polizaId: poliza.id,
      contactId: poliza.contactId,
      diasAviso,
      phoneE164,
      estado: "enviado"
    });
    return { estado: "enviado" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    await registrarAviso(db, {
      organizationId,
      polizaId: poliza.id,
      contactId: poliza.contactId,
      diasAviso,
      phoneE164,
      estado: "fallido",
      error
    });
    return { estado: "fallido", error };
  }
}

export type { RenovacionAvisoRecord };
