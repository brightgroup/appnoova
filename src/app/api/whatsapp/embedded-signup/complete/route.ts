import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { assertEmbeddedSignupConfigured } from "@/lib/meta/embedded-signup-config";
import { provisionWhatsAppFromEmbeddedSignup } from "@/lib/whatsapp/embedded-signup-provision";
import { useTwilioWhatsAppProvisioning } from "@/lib/meta/embedded-signup-config";
import {
  provisionWhatsAppFromEmbeddedSignupMeta
} from "@/lib/whatsapp/meta-provision";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";

/** POST — finalizar vinculación tras Meta Embedded Signup. */
export async function POST(req: NextRequest) {
  const orgCtx = await getOrgContextFromRequest(req, { module: "channels", minLevel: "edit" });
  if (orgCtx instanceof NextResponse) return orgCtx;

  try {
    assertEmbeddedSignupConfigured();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embedded Signup no configurado" },
      { status: 503 }
    );
  }

  let body: {
    waba_id?: string;
    phone_number_id?: string;
    phone_e164?: string;
    display_phone_number?: string;
    text_agent_id?: string;
    friendly_name?: string;
    auth_code?: string;
    channel_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const wabaId = body.waba_id?.trim();
  if (!wabaId) {
    return NextResponse.json({ error: "waba_id requerido" }, { status: 400 });
  }

  const db = adminClient();

  try {
    const input = {
      userId: orgCtx.userId,
      organizationId: orgCtx.organizationId,
      wabaId,
      phoneNumberId: body.phone_number_id ?? null,
      phoneE164: body.phone_e164 ?? null,
      displayPhoneNumber: body.display_phone_number ?? null,
      authCode: body.auth_code ?? null,
      textAgentId: body.text_agent_id ?? null,
      friendlyName: body.friendly_name ?? null,
      channelId: body.channel_id ?? null
    };

    // useTwilioWhatsAppProvisioning es una función de config, no un hook React —
    // el nombre empieza con "use" por convención pero no usa estado ni efectos.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const result = useTwilioWhatsAppProvisioning()
      ? await provisionWhatsAppFromEmbeddedSignup(db, input)
      : await provisionWhatsAppFromEmbeddedSignupMeta(db, input);

    const { data: channelRow } = await db
      .from("whatsapp_channels")
      .select("*")
      .eq("id", result.channelId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      result,
      channel: channelRow ? toWhatsAppChannelRecord(channelRow as Record<string, unknown>) : null
    });
  } catch (err) {
    console.error("[whatsapp/embedded-signup/complete]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al vincular WhatsApp" },
      { status: 500 }
    );
  }
}
