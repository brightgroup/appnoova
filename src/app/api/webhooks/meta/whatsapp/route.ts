import { NextRequest, NextResponse } from "next/server";
import { parseTwilioWhatsAppAddress } from "@/lib/whatsapp-channel";
import {
  claimInboundMessageSid,
  getWhatsAppChannelByE164,
  getWhatsAppChannelByMetaPhoneNumberId
} from "@/lib/whatsapp-server";
import { processTwilioWhatsAppInbound } from "@/lib/whatsapp/process-inbound";
import {
  isMetaStatusOnlyWebhook,
  parseMetaWhatsAppInboundMessages
} from "@/lib/whatsapp/meta-webhook-parse";
import {
  shouldSkipMetaWebhookSignature,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature
} from "@/lib/whatsapp/meta-webhook-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";

/** GET — verificación webhook Meta (hub.challenge). */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const verified = verifyMetaWebhookChallenge(mode, token, challenge);
  if (!verified) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(verified, { status: 200 });
}

/** POST — mensajes entrantes WhatsApp Cloud API. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!shouldSkipMetaWebhookSignature() && !verifyMetaWebhookSignature(rawBody, signature)) {
    console.warn("[meta/whatsapp] firma inválida");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("OK", { status: 200 });
  }

  if (isMetaStatusOnlyWebhook(payload as Parameters<typeof isMetaStatusOnlyWebhook>[0])) {
    return new NextResponse("OK", { status: 200 });
  }

  const messages = parseMetaWhatsAppInboundMessages(
    payload as Parameters<typeof parseMetaWhatsAppInboundMessages>[0]
  );

  if (!messages.length) {
    return new NextResponse("OK", { status: 200 });
  }

  const db = textAgentsAdminClient();

  for (const inbound of messages) {
    try {
      const claimed = await claimInboundMessageSid(db, inbound.messageId);
      if (!claimed) continue;
    } catch (err) {
      console.error("[meta/whatsapp] dedup:", err);
      continue;
    }

    const channel = await getWhatsAppChannelByMetaPhoneNumberId(db, inbound.phoneNumberId);
    if (!channel) {
      console.warn("[meta/whatsapp] canal no registrado:", inbound.phoneNumberId);
      continue;
    }

    const businessE164 = inbound.toE164 || channel.e164;

    const result = await processTwilioWhatsAppInbound(db, channel, {
      messageSid: inbound.messageId,
      fromE164: parseTwilioWhatsAppAddress(inbound.fromE164),
      toE164: parseTwilioWhatsAppAddress(businessE164),
      body: inbound.body,
      profileName: inbound.profileName,
      media: []
    });

    if (!result.ok) {
      console.error("[meta/whatsapp] process:", result.error);
    }
  }

  return new NextResponse("OK", { status: 200 });
}
