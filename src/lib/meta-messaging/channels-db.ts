import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MetaMessagingChannelRecord,
  MetaMessagingPlatform
} from "@/lib/meta-messaging/types";

/**
 * Canal activo para un evento de webhook: Messenger se identifica por page_id,
 * Instagram por ig_user_id (ambos llegan como entry.id).
 */
export async function getActiveMetaMessagingChannel(
  db: SupabaseClient,
  platform: MetaMessagingPlatform,
  accountId: string
): Promise<MetaMessagingChannelRecord | null> {
  const column = platform === "instagram" ? "ig_user_id" : "page_id";
  const { data, error } = await db
    .from("meta_messaging_channels")
    .select("*")
    .eq("platform", platform)
    .eq(column, accountId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[meta-messaging] canal:", error.message);
    return null;
  }
  return (data as MetaMessagingChannelRecord | null) ?? null;
}

/** true si es la primera vez que se ve este `mid` (idempotencia ante reintentos de Meta). */
export async function claimMetaInboundMessage(
  db: SupabaseClient,
  messageId: string
): Promise<boolean> {
  const { error } = await db.from("meta_messaging_inbound_dedup").insert({ message_id: messageId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}
