import type {
  MetaInboundAttachment,
  MetaInboundAttachmentType,
  MetaInboundEvent,
  MetaInboundReferral,
  MetaMessagingPlatform
} from "@/lib/meta-messaging/types";

/**
 * Payload de webhook de Messenger (`object: "page"`) e Instagram Messaging
 * (`object: "instagram"`). Ambos comparten la forma `entry[].messaging[]`.
 * Lecturas, entregas y reacciones se ignoran; los comentarios
 * (`entry[].changes`) se procesarán en una fase posterior.
 */
interface RawMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    app_id?: number | string;
    quick_reply?: { payload?: string };
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
    reply_to?: { mid?: string; story?: { url?: string; id?: string } };
    referral?: RawReferral;
  };
  postback?: { mid?: string; title?: string; payload?: string; referral?: RawReferral };
  referral?: RawReferral;
}

interface RawReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
}

export interface MetaMessagingWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; time?: number; messaging?: RawMessagingEvent[] }>;
}

function platformForObject(object: string | undefined): MetaMessagingPlatform | null {
  if (object === "page") return "messenger";
  if (object === "instagram") return "instagram";
  return null;
}

function toAttachmentType(raw: string | undefined): MetaInboundAttachmentType {
  switch (raw) {
    case "image":
    case "video":
    case "audio":
    case "file":
    case "story_mention":
      return raw;
    default:
      return "other";
  }
}

function toReferral(raw: RawReferral | undefined): MetaInboundReferral | null {
  if (!raw) return null;
  return {
    source: raw.source ?? null,
    type: raw.type ?? null,
    ref: raw.ref ?? null,
    adId: raw.ad_id ?? null
  };
}

function parseEvent(
  platform: MetaMessagingPlatform,
  accountId: string,
  ev: RawMessagingEvent
): MetaInboundEvent | null {
  const senderId = ev.sender?.id?.trim();
  const recipientId = ev.recipient?.id?.trim();
  if (!senderId || !recipientId) return null;
  const timestamp = typeof ev.timestamp === "number" ? ev.timestamp : Date.now();

  if (ev.message) {
    const msg = ev.message;
    if (!msg.mid || msg.is_deleted) return null;
    const isEcho = msg.is_echo === true;
    const attachments: MetaInboundAttachment[] = (msg.attachments ?? []).map(a => ({
      type: toAttachmentType(a.type),
      url: a.payload?.url ?? null
    }));
    const text = msg.text?.trim() ?? "";
    if (!text && !attachments.length && !msg.is_unsupported) return null;

    return {
      platform,
      accountId,
      contactId: isEcho ? recipientId : senderId,
      kind: isEcho ? "echo" : "message",
      messageId: msg.mid,
      timestamp,
      text: text || (msg.is_unsupported ? "[Mensaje no soportado por la API de Meta]" : ""),
      attachments,
      quickReplyPayload: msg.quick_reply?.payload ?? null,
      postbackPayload: null,
      storyReplyUrl: msg.reply_to?.story?.url ?? null,
      referral: toReferral(msg.referral),
      echoAppId: isEcho && msg.app_id != null ? String(msg.app_id) : null
    };
  }

  if (ev.postback) {
    const pb = ev.postback;
    return {
      platform,
      accountId,
      contactId: senderId,
      kind: "postback",
      messageId: pb.mid ?? `pb_${accountId}_${senderId}_${timestamp}`,
      timestamp,
      text: pb.title?.trim() || pb.payload?.trim() || "",
      attachments: [],
      quickReplyPayload: null,
      postbackPayload: pb.payload ?? null,
      storyReplyUrl: null,
      referral: toReferral(pb.referral),
      echoAppId: null
    };
  }

  return null;
}

export function parseMetaMessagingWebhook(payload: MetaMessagingWebhookPayload): MetaInboundEvent[] {
  const platform = platformForObject(payload.object);
  if (!platform) return [];

  const out: MetaInboundEvent[] = [];
  for (const entry of payload.entry ?? []) {
    const accountId = entry.id?.trim();
    if (!accountId) continue;
    for (const ev of entry.messaging ?? []) {
      const parsed = parseEvent(platform, accountId, ev);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}
