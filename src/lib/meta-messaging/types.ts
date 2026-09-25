/** Canales Messenger / Instagram Direct (Meta Graph API directo, sin Twilio). */

export type MetaMessagingPlatform = "messenger" | "instagram";

export type MetaMessagingChannelStatus = "active" | "paused" | "disconnected";

export interface MetaMessagingChannelRecord {
  id: string;
  organization_id: string;
  user_id: string;
  text_agent_id: string | null;
  platform: MetaMessagingPlatform;
  page_id: string;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  page_access_token_enc: string;
  status: MetaMessagingChannelStatus;
  last_error: string | null;
  connected_by_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MetaInboundAttachmentType = "image" | "video" | "audio" | "file" | "story_mention" | "other";

export interface MetaInboundAttachment {
  type: MetaInboundAttachmentType;
  /** URL del CDN de Meta — caduca, hay que descargarla al recibirla. */
  url: string | null;
}

/** Anuncio click-to-Messenger/Instagram o link m.me/ig.me con `ref`. */
export interface MetaInboundReferral {
  source: string | null;
  type: string | null;
  ref: string | null;
  adId: string | null;
}

export interface MetaInboundEvent {
  platform: MetaMessagingPlatform;
  /** entry.id: page_id (Messenger) o ig_user_id (Instagram) del negocio. */
  accountId: string;
  /** PSID / IGSID del cliente final (en un echo, el destinatario). */
  contactId: string;
  kind: "message" | "echo" | "postback";
  /** `mid` del mensaje; en postbacks sin mid se arma uno estable. */
  messageId: string;
  timestamp: number;
  text: string;
  attachments: MetaInboundAttachment[];
  quickReplyPayload: string | null;
  postbackPayload: string | null;
  /** El cliente respondió a una historia del negocio (Instagram). */
  storyReplyUrl: string | null;
  referral: MetaInboundReferral | null;
  /** Echo enviado por esta misma app (Noova) — ya está guardado, no reprocesar. */
  echoAppId: string | null;
}
