import { NextRequest, NextResponse } from "next/server";
import { parseTwilioWhatsAppAddress } from "@/lib/whatsapp-channel";
import {
  claimInboundMessageSid,
  getWhatsAppChannelByE164
} from "@/lib/whatsapp-server";
import { processTwilioWhatsAppInbound } from "@/lib/whatsapp/process-inbound";
import {
  validateTwilioWebhookSignature
} from "@/lib/whatsapp/twilio-whatsapp";
import { twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";
import { textAgentsAdminClient } from "@/lib/text-agents-server";

function parseTwilioForm(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    params[key] = value;
  }
  return params;
}

/** Webhook Twilio — mensajes entrantes WhatsApp (Fase 0). */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);

  const signature = req.headers.get("x-twilio-signature");
  const skipValidation = process.env.TWILIO_WHATSAPP_SKIP_SIGNATURE === "1";

  if (!skipValidation) {
    const valid = validateTwilioWebhookSignature(
      signature,
      twilioWhatsAppWebhookUrl(),
      params
    );
    if (!valid) {
      console.warn("[twilio/whatsapp] firma inválida");
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const messageSid = String(params.MessageSid ?? "");
  const fromRaw = String(params.From ?? "");
  const toRaw = String(params.To ?? "");
  const body = String(params.Body ?? "");
  const profileName = params.ProfileName ? String(params.ProfileName) : null;

  if (!messageSid || !fromRaw || !toRaw) {
    return new NextResponse("", { status: 200 });
  }

  const db = textAgentsAdminClient();

  try {
    const claimed = await claimInboundMessageSid(db, messageSid);
    if (!claimed) {
      return new NextResponse("", { status: 200 });
    }
  } catch (err) {
    console.error("[twilio/whatsapp] dedup:", err);
  }

  const businessE164 = parseTwilioWhatsAppAddress(toRaw);
  const channel = await getWhatsAppChannelByE164(db, businessE164);

  if (!channel) {
    console.warn("[twilio/whatsapp] canal no registrado:", businessE164);
    return new NextResponse("", { status: 200 });
  }

  const result = await processTwilioWhatsAppInbound(db, channel, {
    messageSid,
    fromE164: parseTwilioWhatsAppAddress(fromRaw),
    toE164: businessE164,
    body,
    profileName
  });

  if (!result.ok) {
    console.error("[twilio/whatsapp] process:", result.error);
  }

  return new NextResponse("", { status: 200 });
}
