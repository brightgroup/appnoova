/**
 * Escalamiento a llamada de voz cuando pasa el último hito de WhatsApp y el
 * cliente no respondió. Apagado por defecto por organización
 * (seguros_renovacion_rules.escalar_a_llamada) — un cron desatendido
 * gastando minutos de voz reales es dinero, así que no se enciende solo.
 *
 * Replica deliberadamente la secuencia de POST /api/crm/contacts/[id]/call
 * en vez de extraer un helper compartido desde esa ruta: son ~60 líneas
 * duplicadas, pero tocar esa ruta mientras hay otro agente trabajando en
 * paralelo sobre este mismo repo tiene peor relación riesgo/beneficio, y los
 * dos casos difieren (acción de un usuario autenticado vs. cron
 * desatendido). Queda anotado como duda técnica consciente, no como olvido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { telnyxPlaceCall } from "@/lib/telephony/telnyx-call-control";
import { createCrmOutboundCallSession } from "@/lib/telephony/crm-call-session";
import { checkBillingForUser } from "@/lib/billing/meter";
import { hasSuppression } from "@/lib/crm-contactability";
import { toCrmContact } from "@/lib/crm-record";
import type { RenovacionRule } from "@/lib/insurers/renovacion-rules-db";
import {
  existeAvisoPara,
  registrarAviso,
  listAvisosEnviadosSinRespuesta
} from "@/lib/insurers/renovacion-avisos-db";
import { getPolizaById } from "@/lib/insurers/polizas-db";

/** Sentinel: un aviso con dias_aviso=0 en la misma bitácora representa "se intentó la llamada de escalamiento" — reutiliza el unique(poliza_id, dias_aviso) para la idempotencia, sin tabla nueva. */
const DIAS_AVISO_LLAMADA = 0;

async function placeRenovacionCall(
  db: SupabaseClient,
  userId: string,
  params: { contactId: string; aseguradora: string; ramo: string }
): Promise<void> {
  const { data: contactRow } = await db.from("crm_contacts").select("*").eq("id", params.contactId).maybeSingle();
  if (!contactRow) throw new Error("Contacto no encontrado");
  const contact = toCrmContact(contactRow);

  if (hasSuppression(contact, "no_llamadas")) throw new Error("Contacto solicitó no recibir llamadas");
  const destination = contact.telefono || contact.phone || "";
  if (!destination) throw new Error("Sin teléfono válido");

  const { data: phone } = await db
    .from("phone_numbers")
    .select("id, e164, voice_agent_id, voice_config")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("voice_agent_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!phone?.voice_agent_id) throw new Error("Sin línea de voz activa con agente asignado");

  const { data: agent } = await db
    .from("voice_agents")
    .select("id, name")
    .eq("id", phone.voice_agent_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!agent) throw new Error("Agente de voz no encontrado");

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })?.telnyx;
  const connectionId = telnyx?.connection_id || telnyx?.call_control_app_id || process.env.TELNYX_CONNECTION_ID?.trim();
  if (!connectionId) throw new Error("TELNYX_CONNECTION_ID no configurado");

  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) throw new Error(`Facturación bloqueada (${billing.reason})`);

  const { callControlId } = await telnyxPlaceCall({
    connectionId,
    from: phone.e164,
    to: destination,
    clientState: {
      type: "crm_outbound",
      user_id: userId,
      voice_agent_id: agent.id,
      phone_number_id: phone.id,
      crm_contact_id: params.contactId,
      destination_e164: destination
    }
  });

  await createCrmOutboundCallSession({
    userId,
    voiceAgentId: agent.id,
    callControlId,
    phoneNumberId: phone.id,
    crmContactId: params.contactId,
    from: phone.e164,
    to: destination,
    agentName: agent.name,
    contactName: contact.name
  });
}

export async function escalarRenovacionALlamada(
  db: SupabaseClient,
  rule: RenovacionRule,
  crmUserId: string
): Promise<void> {
  const ultimoHito = Math.min(...rule.diasAviso);
  const pendientes = await listAvisosEnviadosSinRespuesta(db, rule.organizationId);
  const candidatos = pendientes.filter(a => a.diasAviso === ultimoHito);

  for (const aviso of candidatos) {
    if (await existeAvisoPara(db, aviso.polizaId, DIAS_AVISO_LLAMADA)) continue;

    const poliza = await getPolizaById(db, crmUserId, aviso.polizaId);
    if (!poliza || !aviso.contactId) continue;

    try {
      await placeRenovacionCall(db, crmUserId, {
        contactId: aviso.contactId,
        aseguradora: poliza.aseguradora,
        ramo: poliza.ramo
      });
      await registrarAviso(db, {
        organizationId: rule.organizationId,
        polizaId: poliza.id,
        contactId: aviso.contactId,
        diasAviso: DIAS_AVISO_LLAMADA,
        phoneE164: aviso.phoneE164,
        estado: "enviado"
      });
    } catch (err) {
      await registrarAviso(db, {
        organizationId: rule.organizationId,
        polizaId: poliza.id,
        contactId: aviso.contactId,
        diasAviso: DIAS_AVISO_LLAMADA,
        phoneE164: aviso.phoneE164,
        estado: "fallido",
        error: err instanceof Error ? err.message : "Error desconocido"
      });
    }
  }
}
