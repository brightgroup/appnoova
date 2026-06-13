export interface TwilioWhatsAppMediaItem {
  url: string;
  contentType: string;
}

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

/** Extrae adjuntos del payload del webhook Twilio WhatsApp. */
export function parseTwilioWhatsAppMedia(params: Record<string, string>): TwilioWhatsAppMediaItem[] {
  const count = Number.parseInt(String(params.NumMedia ?? "0"), 10);
  if (!Number.isFinite(count) || count <= 0) return [];

  const items: TwilioWhatsAppMediaItem[] = [];
  for (let i = 0; i < count; i++) {
    const url = String(params[`MediaUrl${i}`] ?? "").trim();
    const contentType = String(params[`MediaContentType${i}`] ?? "application/octet-stream").trim();
    if (url) items.push({ url, contentType });
  }
  return items;
}

function twilioAuthHeader(): string | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/** Descarga media entrante de Twilio (requiere auth). */
export async function downloadTwilioWhatsAppMedia(
  mediaUrl: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const auth = twilioAuthHeader();
  if (!auth) throw new Error("Twilio no configurado");

  const res = await fetch(mediaUrl, { headers: { Authorization: auth } });
  if (!res.ok) {
    throw new Error(`No se pudo descargar media Twilio (${res.status})`);
  }

  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("Archivo demasiado grande para procesar");
  }

  return { buffer: Buffer.from(arrayBuffer), contentType };
}

export function mediaKindFromContentType(contentType: string): "audio" | "image" | "document" | "video" | "other" {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("application/pdf") || ct.startsWith("application/")) return "document";
  return "other";
}

export function mediaKindLabel(kind: ReturnType<typeof mediaKindFromContentType>): string {
  switch (kind) {
    case "audio":
      return "Nota de voz";
    case "image":
      return "Imagen";
    case "video":
      return "Video";
    case "document":
      return "Documento";
    default:
      return "Archivo";
  }
}

export function extensionForMediaMime(contentType: string): string {
  const m = contentType.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("amr")) return "amr";
  if (m.includes("aac")) return "aac";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("3gpp")) return "3gp";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("mp4") && m.startsWith("video/")) return "mp4";
  if (m.includes("mp4") && m.startsWith("audio/")) return "m4a";
  if (m.includes("webm")) return "webm";
  return "bin";
}
