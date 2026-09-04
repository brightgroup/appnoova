import type { SupabaseClient } from "@supabase/supabase-js";
import type { TextChatMessage } from "@/types/text-agent-conversation";
import { extensionForMediaMime } from "@/lib/whatsapp/twilio-media";

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

const SIGNED_URL_TTL_SEC = 3600;

export function whatsAppMediaStoragePath(
  userId: string,
  messageSid: string,
  index: number,
  contentType: string
): string {
  const ext = extensionForMediaMime(contentType);
  const safeSid = messageSid.replace(/[^a-zA-Z0-9]/g, "");
  return `${userId}/${safeSid}-${index}.${ext}`;
}

export async function uploadWhatsAppMedia(
  db: SupabaseClient,
  userId: string,
  messageSid: string,
  index: number,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const path = whatsAppMediaStoragePath(userId, messageSid, index, contentType);

  const { error } = await db.storage.from(WHATSAPP_MEDIA_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true
  });

  if (error) {
    console.error("[whatsapp/media-storage] upload:", error.message);
    return null;
  }

  return path;
}

/**
 * `downloadFilename`, si viene, hace que Supabase Storage sirva la URL firmada con
 * `Content-Disposition: attachment; filename="..."` — así Twilio/Meta (que infieren el nombre
 * del archivo de la URL/respuesta, no de nuestro nombre interno en el bucket) le muestran al
 * destinatario de WhatsApp el nombre real del archivo en vez del nombre interno de storage.
 */
export async function signedUrlForPath(
  db: SupabaseClient,
  path: string,
  downloadFilename?: string
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC, downloadFilename ? { download: downloadFilename } : undefined);

  if (error || !data?.signedUrl) {
    console.warn("[whatsapp/media-storage] sign:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Añade media_url temporal (firmada) a mensajes con media_storage_path. */
export async function signWhatsAppMessageMedia(
  db: SupabaseClient,
  userId: string,
  messages: TextChatMessage[]
): Promise<TextChatMessage[]> {
  return Promise.all(
    messages.map(async msg => {
      const path = msg.media_storage_path?.trim();
      if (!path || !path.startsWith(`${userId}/`)) return msg;
      const signed = await signedUrlForPath(db, path);
      if (!signed) return msg;
      return { ...msg, media_url: signed };
    })
  );
}
