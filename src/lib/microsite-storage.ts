import type { SupabaseClient } from "@supabase/supabase-js";

export const MICROSITE_ASSETS_BUCKET = "microsite-assets";

export type MicrositeAssetKind = "logo" | "favicon";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon"
]);

export function micrositeAssetPath(userId: string, kind: MicrositeAssetKind, ext: string): string {
  return `${userId}/${kind}.${ext}`;
}

export function publicMicrositeAssetUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${MICROSITE_ASSETS_BUCKET}/${path}`;
}

export function extensionForMime(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("icon") || contentType.includes("x-icon")) return "ico";
  return "png";
}

export function isAllowedMicrositeImage(contentType: string): boolean {
  return ALLOWED_MIME.has(contentType);
}

export async function uploadMicrositeAsset(
  db: SupabaseClient,
  userId: string,
  kind: MicrositeAssetKind,
  file: Blob | Buffer,
  contentType: string
): Promise<string | null> {
  if (!isAllowedMicrositeImage(contentType)) return null;

  const ext = extensionForMime(contentType);
  const path = micrositeAssetPath(userId, kind, ext);

  const { error } = await db.storage
    .from(MICROSITE_ASSETS_BUCKET)
    .upload(path, file, { contentType, upsert: true });

  if (error) {
    console.error("[microsite-storage] upload error:", error.message);
    return null;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${publicMicrositeAssetUrl(base, path)}?v=${Date.now()}`;
}
