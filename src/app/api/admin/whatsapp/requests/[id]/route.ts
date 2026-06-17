import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { createTwilioSubaccount } from "@/lib/telephony/twilio-subaccounts";

/** PATCH — actualizar estado o aprovisionar solicitud de WhatsApp. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, notes, action } = body;

  const db = adminClient();

  // 1. Obtener la solicitud con datos de la organización
  const { data: request, error: fetchErr } = await db
    .from("whatsapp_line_requests")
    .select("*, organizations(*)")
    .eq("id", id)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const organization = (request as any).organizations;

  // 2. Si la acción es "provision", crear/obtener subcuenta y crear canal
  if (action === "provision") {
    if (request.status === "completed") {
      return NextResponse.json({ error: "Esta solicitud ya fue completada" }, { status: 400 });
    }

    try {
      let subaccountSid = organization?.twilio_subaccount_sid;
      let subaccountAuthToken = organization?.twilio_subaccount_auth_token;

      // Si la organización no tiene subcuenta, crear una nueva
      if (!subaccountSid || !subaccountAuthToken) {
        const subName = `Noova - ${organization?.name || request.id.slice(0, 8)}`;
        const subaccount = await createTwilioSubaccount(subName);
        subaccountSid = subaccount.sid;
        subaccountAuthToken = subaccount.authToken;

        // Guardar subcuenta en la organización
        const { error: orgErr } = await db
          .from("organizations")
          .update({
            twilio_subaccount_sid: subaccountSid,
            twilio_subaccount_auth_token: subaccountAuthToken,
            updated_at: new Date().toISOString()
          })
          .eq("id", request.organization_id);
        
        if (orgErr) throw new Error(`Error vinculando subcuenta a org: ${orgErr.message}`);
      }

      // Crear el canal de WhatsApp usando la subcuenta (nueva o existente)
      const { data: channel, error: channelErr } = await db
        .from("whatsapp_channels")
        .insert({
          user_id: request.user_id,
          organization_id: request.organization_id, // Asegurarnos de guardar la org
          text_agent_id: request.text_agent_id,
          e164: request.phone_e164 || "PENDING",
          friendly_name: request.friendly_name || `WhatsApp ${request.phone_e164 || ""}`,
          status: "pending",
          provider: "twilio",
          twilio_subaccount_sid: subaccountSid,
          twilio_subaccount_auth_token: subaccountAuthToken,
          metadata: {
            request_id: request.id,
            provisioned_at: new Date().toISOString(),
            is_reused_subaccount: !!organization?.twilio_subaccount_sid
          }
        })
        .select("*")
        .single();

      if (channelErr) throw new Error(`Error creando canal: ${channelErr.message}`);

      // Marcar solicitud como completada
      await db
        .from("whatsapp_line_requests")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json({ 
        success: true, 
        channel,
        subaccount: { sid: subaccountSid }
      });
    } catch (err) {
      return NextResponse.json({ 
        error: err instanceof Error ? err.message : "Error al aprovisionar" 
      }, { status: 500 });
    }
  }

  // 3. Actualización normal de estado/notas
  const updates: any = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const { data: updated, error: updateErr } = await db
    .from("whatsapp_line_requests")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ request: updated });
}
