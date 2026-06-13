import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/media-storage";
import {
  downloadTwilioWhatsAppMedia,
  mediaKindFromContentType,
  mediaKindLabel,
  type TwilioWhatsAppMediaItem
} from "@/lib/whatsapp/twilio-media";

export const WHATSAPP_VIDEO_AI_NOTICE =
  "El cliente envió un archivo de video. No es posible analizar el contenido de videos.";

export interface ProcessedWhatsAppMedia {
  kind: "audio" | "image" | "document" | "video" | "other";
  label: string;
  textForAi: string;
  displayContent: string;
  mediaStoragePath?: string;
  mediaMime?: string;
}

export interface InboundContentResult {
  userText: string;
  displayContent: string;
  primaryMediaType?: "audio" | "image" | "document" | "video";
  mediaLabel?: string;
  mediaStoragePath?: string;
  mediaMime?: string;
}

export interface WhatsAppMediaUploadContext {
  db: SupabaseClient;
  userId: string;
  messageSid: string;
}

async function geminiUnderstandMedia(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  instruction: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          { text: instruction }
        ]
      }
    ],
    config: { temperature: 0.2, maxOutputTokens: 2048 }
  });
  return response.text?.trim() ?? "";
}

async function storeMedia(
  ctx: WhatsAppMediaUploadContext,
  index: number,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  return uploadWhatsAppMedia(ctx.db, ctx.userId, ctx.messageSid, index, buffer, contentType);
}

async function processOneMediaItem(
  apiKey: string,
  item: TwilioWhatsAppMediaItem,
  caption: string,
  ctx: WhatsAppMediaUploadContext,
  index: number
): Promise<ProcessedWhatsAppMedia> {
  const kind = mediaKindFromContentType(item.contentType);
  const label = mediaKindLabel(kind);

  try {
    const { buffer, contentType } = await downloadTwilioWhatsAppMedia(item.url);
    const mime = contentType || item.contentType;
    const storagePath = await storeMedia(ctx, index, buffer, mime);

    if (kind === "video") {
      return {
        kind,
        label,
        textForAi: `[Video]: ${WHATSAPP_VIDEO_AI_NOTICE}`,
        displayContent: "",
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime
      };
    }

    if (kind === "audio") {
      const transcript = await geminiUnderstandMedia(
        apiKey,
        buffer,
        mime,
        "Transcribe este audio de WhatsApp al español. Devuelve solo la transcripción literal, sin comillas ni prefijos."
      );
      const text = transcript || "(No se pudo transcribir el audio)";
      return {
        kind,
        label,
        textForAi: `[Nota de voz]: ${text}`,
        displayContent: text,
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime
      };
    }

    if (kind === "image") {
      const description = await geminiUnderstandMedia(
        apiKey,
        buffer,
        mime,
        caption.trim()
          ? `El cliente envió una imagen con este pie de foto: "${caption.trim()}". Describe la imagen en español para atención al cliente e incluye el sentido del caption.`
          : "Describe esta imagen de WhatsApp en español para un agente de atención al cliente (contenido, texto visible, contexto)."
      );
      const text = description || "(No se pudo interpretar la imagen)";
      const displayLines = [caption.trim(), text].filter(Boolean);
      return {
        kind,
        label,
        textForAi: `[Imagen${caption.trim() ? ` — ${caption.trim()}` : ""}]: ${text}`,
        displayContent: displayLines.join("\n\n"),
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime
      };
    }

    if (kind === "document" && mime === "application/pdf") {
      const summary = await geminiUnderstandMedia(
        apiKey,
        buffer,
        mime,
        "Resume el contenido principal de este PDF en español para atención al cliente."
      );
      const text = summary || "(PDF recibido)";
      return {
        kind: "document",
        label,
        textForAi: `[Documento PDF]: ${text}`,
        displayContent: text,
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime
      };
    }

    return {
      kind,
      label,
      textForAi: `[${label} recibido — tipo ${mime}]`,
      displayContent: `${label} recibido`,
      mediaStoragePath: storagePath ?? undefined,
      mediaMime: mime
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al procesar archivo";
    return {
      kind,
      label,
      textForAi: `[${label}: no procesado — ${msg}]`,
      displayContent: `${label} (no procesado)`,
      mediaMime: item.contentType
    };
  }
}

/** Convierte texto + adjuntos Twilio en contenido unificado para IA e Inbox. */
export async function buildWhatsAppInboundContent(
  apiKey: string,
  body: string,
  media: TwilioWhatsAppMediaItem[],
  uploadCtx: WhatsAppMediaUploadContext
): Promise<InboundContentResult> {
  const caption = body.trim();
  const parts: string[] = [];
  const displayParts: string[] = [];
  let primaryMediaType: InboundContentResult["primaryMediaType"];
  let mediaLabel: string | undefined;
  let mediaStoragePath: string | undefined;
  let mediaMime: string | undefined;

  if (caption && media.length === 0) {
    parts.push(caption);
    displayParts.push(caption);
  }

  for (let i = 0; i < media.length; i++) {
    const processed = await processOneMediaItem(apiKey, media[i], caption, uploadCtx, i);
    parts.push(processed.textForAi);
    if (processed.displayContent) displayParts.push(processed.displayContent);
    if (!primaryMediaType && processed.kind !== "other") {
      primaryMediaType = processed.kind;
      mediaLabel = processed.label;
      mediaStoragePath = processed.mediaStoragePath;
      mediaMime = processed.mediaMime;
    }
  }

  const userText = parts.join("\n\n").trim();
  const displayContent = displayParts.join("\n\n").trim();

  return {
    userText,
    displayContent: displayContent || userText,
    primaryMediaType,
    mediaLabel,
    mediaStoragePath,
    mediaMime
  };
}
