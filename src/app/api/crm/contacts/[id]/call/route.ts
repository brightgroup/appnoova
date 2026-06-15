import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { computeContactActions, hasSuppression } from "@/lib/crm-contactability";
import { telnyxPlaceCall } from "@/lib/telephony/telnyx-call-control";
import { createCrmOutboundCallSession } from "@/lib/telephony/crm-call-session";
import { toE164 } from "@/lib/telephony/e164";
import { enrichCrmContact, toCrmContact } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(_req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const { data: contactRow } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!contactRow) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = enrichCrmContact(toCrmContact(contactRow));
  const actions = computeContactActions(contact);

  if (!actions.call.allowed) {
    return NextResponse.json({ error: actions.call.reason ?? "Llamada no permitida" }, { status: 400 });
  }

  const destination = toE164(contact.telefono || contact.phone || "");
  if (!destination) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }

  if (hasSuppression(contact, "no_llamadas")) {
    return NextResponse.json({ error: "Contacto solicitó no recibir llamadas" }, { status: 400 });
  }

  const { data: phone } = await db
    .from("phone_numbers")
    .select("id, e164, voice_agent_id, voice_config")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("voice_agent_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!phone?.voice_agent_id) {
    return NextResponse.json(
      { error: "No tienes una línea telefónica activa con agente de voz asignado." },
      { status: 400 }
    );
  }

  const { data: agent } = await db
    .from("voice_agents")
    .select("id, name")
    .eq("id", phone.voice_agent_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) return NextResponse.json({ error: "Agente de voz no encontrado" }, { status: 404 });

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })?.telnyx;
  const connectionId =
    telnyx?.connection_id ||
    telnyx?.call_control_app_id ||
    process.env.TELNYX_CONNECTION_ID?.trim();

  if (!connectionId) {
    return NextResponse.json({ error: "TELNYX_CONNECTION_ID no configurado" }, { status: 503 });
  }

  try {
    const clientState = {
      type: "crm_outbound",
      user_id: userId,
      voice_agent_id: agent.id,
      phone_number_id: phone.id,
      crm_contact_id: id,
      destination_e164: destination
    };

    const { callControlId } = await telnyxPlaceCall({
      connectionId,
      from: phone.e164,
      to: destination,
      clientState
    });

    const callId = await createCrmOutboundCallSession({
      userId,
      voiceAgentId: agent.id,
      callControlId,
      phoneNumberId: phone.id,
      crmContactId: id,
      from: phone.e164,
      to: destination,
      agentName: agent.name,
      contactName: contact.name
    });

    return NextResponse.json({
      ok: true,
      call_id: callId,
      call_control_id: callControlId,
      from: phone.e164,
      to: destination,
      agent_name: agent.name,
      phase: "dialing"
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al marcar";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
