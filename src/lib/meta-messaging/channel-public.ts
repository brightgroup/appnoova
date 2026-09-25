import type { MetaMessagingChannelRecord } from "@/lib/meta-messaging/types";

/** Canal sin el token cifrado — lo que se entrega al navegador. */
export type MetaMessagingChannelPublic = Omit<MetaMessagingChannelRecord, "page_access_token_enc">;

export function toPublicMetaMessagingChannel(row: MetaMessagingChannelRecord): MetaMessagingChannelPublic {
  const rest: Partial<MetaMessagingChannelRecord> = { ...row };
  delete rest.page_access_token_enc;
  return rest as MetaMessagingChannelPublic;
}
