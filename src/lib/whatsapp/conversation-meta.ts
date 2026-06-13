import type { TextChatMessage } from "@/types/text-agent-conversation";

export interface WhatsAppConversationMetaPatch {
  whatsapp_channel_id: string;
  whatsapp_contact_e164: string;
  last_twilio_message_sid: string;
  whatsapp_last_inbound_at?: string;
  whatsapp_opted_out?: boolean;
  whatsapp_opted_out_at?: string | null;
}

export function mergeWhatsAppMetadata(
  existing: Record<string, unknown> | undefined,
  patch: WhatsAppConversationMetaPatch
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

export function userMessageForPersist(input: {
  content: string;
  mediaType?: TextChatMessage["media_type"];
  mediaLabel?: string;
}): {
  role: "user";
  content: string;
  media_type?: TextChatMessage["media_type"];
  media_label?: string;
} {
  return {
    role: "user",
    content: input.content,
    ...(input.mediaType ? { media_type: input.mediaType } : {}),
    ...(input.mediaLabel ? { media_label: input.mediaLabel } : {})
  };
}
