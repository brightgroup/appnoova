import { NextRequest, NextResponse } from "next/server";
import {
  validateTwilioWebhookSignature
} from "@/lib/whatsapp/twilio-whatsapp";
import { twilioWhatsAppStatusWebhookUrl } from "@/lib/telephony/app-url";

function parseTwilioForm(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    params[key] = value;
  }
  return params;
}

/** Webhook Twilio — estados de entrega WhatsApp (failed, undelivered, etc.). */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);

  const signature = req.headers.get("x-twilio-signature");
  const skipValidation = process.env.TWILIO_WHATSAPP_SKIP_SIGNATURE === "1";

  if (!skipValidation) {
    const valid = validateTwilioWebhookSignature(
      signature,
      twilioWhatsAppStatusWebhookUrl(),
      params
    );
    if (!valid) {
      console.warn("[twilio/whatsapp/status] firma inválida");
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const messageSid = String(params.MessageSid ?? "");
  const status = String(params.MessageStatus ?? "");
  const errorCode = params.ErrorCode ? String(params.ErrorCode) : null;
  const errorMessage = params.ErrorMessage ? String(params.ErrorMessage) : null;

  if (messageSid && (status === "failed" || status === "undelivered")) {
    console.warn("[twilio/whatsapp/status] entrega fallida", {
      messageSid,
      status,
      errorCode,
      errorMessage,
      to: params.To,
      from: params.From
    });
  }

  return new NextResponse("", { status: 200 });
}
