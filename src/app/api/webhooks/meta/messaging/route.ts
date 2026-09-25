import { NextRequest, NextResponse } from "next/server";
import { claimMetaInboundMessage, getActiveMetaMessagingChannel } from "@/lib/meta-messaging/channels-db";
import { processMetaMessagingInbound } from "@/lib/meta-messaging/process-inbound";
import {
  parseMetaMessagingWebhook,
  type MetaMessagingWebhookPayload
} from "@/lib/meta-messaging/webhook-parse";
import {
  shouldSkipMetaWebhookSignature,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature
} from "@/lib/whatsapp/meta-webhook-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";

/**
 * Webhook único para Messenger (object "page") e Instagram Direct
 * (object "instagram"). Se configura en la app de Meta en ambos productos
 * con la misma URL y el mismo verify token que WhatsApp.
 */

/** GET — verificación webhook Meta (hub.challenge). */
export async function GET(req: NextRequest) {
  const verified = verifyMetaWebhookChallenge(
    req.nextUrl.searchParams.get("hub.mode"),
    req.nextUrl.searchParams.get("hub.verify_token"),
    req.nextUrl.searchParams.get("hub.challenge")
  );
  if (!verified) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(verified, { status: 200 });
}

/** POST — mensajes, echos y postbacks entrantes. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!shouldSkipMetaWebhookSignature() && !verifyMetaWebhookSignature(rawBody, signature)) {
    console.warn("[meta/messaging] firma inválida");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: MetaMessagingWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaMessagingWebhookPayload;
  } catch {
    return new NextResponse("OK", { status: 200 });
  }

  const events = parseMetaMessagingWebhook(payload);
  if (!events.length) return new NextResponse("OK", { status: 200 });

  const db = textAgentsAdminClient();

  for (const event of events) {
    const channel = await getActiveMetaMessagingChannel(db, event.platform, event.accountId);
    if (!channel) {
      console.warn(`[meta/messaging] canal ${event.platform} no registrado:`, event.accountId);
      continue;
    }

    try {
      const claimed = await claimMetaInboundMessage(db, event.messageId);
      if (!claimed) continue;
    } catch (err) {
      console.error("[meta/messaging] dedup:", err);
      continue;
    }

    try {
      const result = await processMetaMessagingInbound(db, channel, event);
      if (!result.ok) console.error(`[meta/messaging] ${event.platform}:`, result.error);
    } catch (err) {
      console.error(`[meta/messaging] ${event.platform}:`, err);
    }
  }

  // Siempre 200: Meta desactiva la suscripción si el webhook falla de forma sostenida.
  return new NextResponse("OK", { status: 200 });
}
