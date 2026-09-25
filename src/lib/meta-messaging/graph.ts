import { metaGraphBaseUrl } from "@/lib/meta/graph-config";
import type { MetaMessagingPlatform } from "@/lib/meta-messaging/types";

export interface MetaContactProfile {
  name: string | null;
  username: string | null;
  profilePicUrl: string | null;
}

/**
 * Nombre del cliente para el contacto en el inbox. Messenger expone
 * first_name/last_name/profile_pic sobre el PSID; Instagram name/username/
 * profile_pic sobre el IGSID. Si Meta no lo entrega (permiso "Business Asset
 * User Profile Access" sin aprobar, usuario con privacidad), se devuelve vacío
 * y el llamador usa un nombre genérico.
 */
export async function fetchMetaContactProfile(
  platform: MetaMessagingPlatform,
  contactId: string,
  pageAccessToken: string
): Promise<MetaContactProfile> {
  const empty: MetaContactProfile = { name: null, username: null, profilePicUrl: null };
  const fields = platform === "instagram" ? "name,username,profile_pic" : "first_name,last_name,profile_pic";
  const url = `${metaGraphBaseUrl()}/${encodeURIComponent(contactId)}?fields=${fields}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      console.warn("[meta-messaging] perfil:", res.status, await res.text().catch(() => ""));
      return empty;
    }
    const data = (await res.json()) as Record<string, string | undefined>;
    const name =
      platform === "instagram"
        ? data.name?.trim() || null
        : [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
    return {
      name,
      username: data.username?.trim() || null,
      profilePicUrl: data.profile_pic ?? null
    };
  } catch (err) {
    console.warn("[meta-messaging] perfil:", err);
    return empty;
  }
}

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** Descarga un adjunto del CDN de Meta (la URL es firmada y caduca en horas). */
export async function downloadMetaAttachment(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_MEDIA_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream";
    return { buffer, contentType };
  } catch (err) {
    console.warn("[meta-messaging] descarga adjunto:", err);
    return null;
  }
}
