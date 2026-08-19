import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/media-storage";
import { readGeminiUsage, type GeminiUsage } from "@/lib/billing/meter";
import { withGeminiTimeout } from "@/lib/gemini-timeout";
import { getAnthropicApiKey, readClaudeUsage } from "@/lib/text-agent-generate-claude";
import {
  downloadTwilioWhatsAppMedia,
  mediaKindFromContentType,
  mediaKindLabel,
  type TwilioWhatsAppMediaItem
} from "@/lib/whatsapp/twilio-media";

const ZERO_USAGE: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

export type MediaProvider = "google" | "anthropic";

function addUsage(a: GeminiUsage, b: GeminiUsage): GeminiUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

export const WHATSAPP_VIDEO_AI_NOTICE =
  "El cliente envió un archivo de video. No es posible analizar el contenido de videos.";

export interface ProcessedWhatsAppMedia {
  kind: "audio" | "image" | "document" | "video" | "other";
  label: string;
  textForAi: string;
  visibleContent: string;
  mediaStoragePath?: string;
  mediaMime?: string;
  /** Uso de tokens de este ítem (0 si no se llamó a la IA, p.ej. video). */
  usage: GeminiUsage;
  /** Proveedor real que analizó este ítem — "google" si no se llamó a la IA. */
  provider: MediaProvider;
  /**
   * true para imagen/documento (se factura aparte como whatsapp_media_ai, con
   * línea propia editable en /admin/pricing). false para audio/video/otro —
   * el audio se factura junto al turno whatsapp_ai como antes.
   */
  isVisual: boolean;
}

export interface InboundContentResult {
  userText: string;
  userVisible: string;
  primaryMediaType?: "audio" | "image" | "document" | "video";
  mediaLabel?: string;
  mediaStoragePath?: string;
  mediaMime?: string;
  /** Uso de audio (transcripción) — siempre Gemini, se suma al turno whatsapp_ai. */
  audioUsage: GeminiUsage;
  /**
   * Uso de imagen/PDF por proveedor real — se factura aparte como
   * whatsapp_media_ai (línea propia, visible y editable en /admin/pricing).
   */
  visualUsageByProvider: Record<MediaProvider, GeminiUsage>;
  /** Cantidad de imágenes/PDF analizados en este mensaje (whatsapp_media_ai cobra por archivo). */
  visualItemCount: number;
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
): Promise<{ text: string; usage: GeminiUsage }> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await withGeminiTimeout(abortSignal =>
    ai.models.generateContent({
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
      config: { temperature: 0.2, maxOutputTokens: 2048, abortSignal }
    })
  );
  return { text: response.text?.trim() ?? "", usage: readGeminiUsage(response) };
}

/**
 * Análisis de imagen/PDF con Claude — usa visión/documentos nativos del Messages API.
 * NO cubre audio: Claude no tiene forma de recibir audio en su API, a diferencia de
 * Gemini. Las notas de voz de WhatsApp siempre pasan por `geminiUnderstandMedia`,
 * sin importar qué modelo tenga configurado el agente.
 */
async function claudeUnderstandMedia(
  model: string,
  buffer: Buffer,
  mimeType: string,
  instruction: string,
  kind: "image" | "document"
): Promise<{ text: string; usage: GeminiUsage }> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  const mediaBlock: Anthropic.ContentBlockParam =
    kind === "image"
      ? {
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/jpeg", data: buffer.toString("base64") }
        }
      : {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") }
        };

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.2,
    messages: [{ role: "user", content: [mediaBlock, { type: "text", text: instruction }] }]
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();

  return { text, usage: readClaudeUsage(response) };
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
  model: string,
  item: TwilioWhatsAppMediaItem,
  caption: string,
  ctx: WhatsAppMediaUploadContext,
  index: number
): Promise<ProcessedWhatsAppMedia> {
  const kind = mediaKindFromContentType(item.contentType);
  const label = mediaKindLabel(kind);
  const useClaude = model.startsWith("claude-");

  try {
    const { buffer, contentType } = await downloadTwilioWhatsAppMedia(item.url);
    const mime = contentType || item.contentType;
    const storagePath = await storeMedia(ctx, index, buffer, mime);

    if (kind === "video") {
      return {
        kind,
        label,
        textForAi: `[Video]: ${WHATSAPP_VIDEO_AI_NOTICE}`,
        visibleContent: "",
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime,
        usage: ZERO_USAGE,
        provider: "google",
        isVisual: false
      };
    }

    if (kind === "audio") {
      // Siempre Gemini: Claude no tiene entrada de audio en su API.
      const { text: transcript, usage } = await geminiUnderstandMedia(
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
        visibleContent: "",
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime,
        usage,
        provider: "google",
        isVisual: false
      };
    }

    if (kind === "image") {
      const instruction = caption.trim()
        ? `El cliente envió una imagen con este pie de foto: "${caption.trim()}". Describe la imagen en español para atención al cliente e incluye el sentido del caption.`
        : "Describe esta imagen de WhatsApp en español para un agente de atención al cliente (contenido, texto visible, contexto).";
      const { text: description, usage } = useClaude
        ? await claudeUnderstandMedia(model, buffer, mime, instruction, "image")
        : await geminiUnderstandMedia(apiKey, buffer, mime, instruction);
      const text = description || "(No se pudo interpretar la imagen)";
      return {
        kind,
        label,
        textForAi: `[Imagen${caption.trim() ? ` — ${caption.trim()}` : ""}]: ${text}`,
        visibleContent: caption.trim(),
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime,
        usage,
        provider: useClaude ? "anthropic" : "google",
        isVisual: true
      };
    }

    if (kind === "document" && mime === "application/pdf") {
      const instruction = "Resume el contenido principal de este PDF en español para atención al cliente.";
      const { text: summary, usage } = useClaude
        ? await claudeUnderstandMedia(model, buffer, mime, instruction, "document")
        : await geminiUnderstandMedia(apiKey, buffer, mime, instruction);
      const text = summary || "(PDF recibido)";
      return {
        kind: "document",
        label,
        textForAi: `[Documento PDF]: ${text}`,
        visibleContent: "",
        mediaStoragePath: storagePath ?? undefined,
        mediaMime: mime,
        usage,
        provider: useClaude ? "anthropic" : "google",
        isVisual: true
      };
    }

    return {
      kind,
      label,
      textForAi: `[${label} recibido — tipo ${mime}]`,
      visibleContent: "",
      mediaStoragePath: storagePath ?? undefined,
      mediaMime: mime,
      usage: ZERO_USAGE,
      provider: "google",
      isVisual: false
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al procesar archivo";
    return {
      kind,
      label,
      textForAi: `[${label}: no procesado — ${msg}]`,
      visibleContent: "",
      mediaMime: item.contentType,
      usage: ZERO_USAGE,
      provider: "google",
      isVisual: false
    };
  }
}

/**
 * Convierte texto + adjuntos Twilio: userText (IA) vs userVisible (Inbox).
 * `model` es el modelo configurado en el agente — imagen y PDF se analizan con
 * ese mismo modelo (Gemini o Claude); el audio siempre usa Gemini (ver
 * claudeUnderstandMedia para el porqué).
 */
export async function buildWhatsAppInboundContent(
  apiKey: string,
  model: string,
  body: string,
  media: TwilioWhatsAppMediaItem[],
  uploadCtx: WhatsAppMediaUploadContext
): Promise<InboundContentResult> {
  const caption = body.trim();
  const aiParts: string[] = [];
  const visibleParts: string[] = [];
  let primaryMediaType: InboundContentResult["primaryMediaType"];
  let mediaLabel: string | undefined;
  let mediaStoragePath: string | undefined;
  let mediaMime: string | undefined;

  if (caption && media.length === 0) {
    aiParts.push(caption);
    visibleParts.push(caption);
  }

  let audioUsage: GeminiUsage = ZERO_USAGE;
  const visualUsageByProvider: Record<MediaProvider, GeminiUsage> = {
    google: ZERO_USAGE,
    anthropic: ZERO_USAGE
  };
  let visualItemCount = 0;

  for (let i = 0; i < media.length; i++) {
    const processed = await processOneMediaItem(apiKey, model, media[i], caption, uploadCtx, i);
    aiParts.push(processed.textForAi);
    if (processed.visibleContent) visibleParts.push(processed.visibleContent);
    if (processed.isVisual) {
      visualUsageByProvider[processed.provider] = addUsage(visualUsageByProvider[processed.provider], processed.usage);
      if (processed.usage.totalTokens > 0) visualItemCount += 1;
    } else {
      audioUsage = addUsage(audioUsage, processed.usage);
    }
    if (!primaryMediaType && processed.kind !== "other") {
      primaryMediaType = processed.kind;
      mediaLabel = processed.label;
      mediaStoragePath = processed.mediaStoragePath;
      mediaMime = processed.mediaMime;
    }
  }

  const userText = aiParts.join("\n\n").trim();
  const userVisible = visibleParts.join("\n\n").trim();

  return {
    userText,
    userVisible,
    primaryMediaType,
    mediaLabel,
    mediaStoragePath,
    mediaMime,
    audioUsage,
    visualUsageByProvider,
    visualItemCount
  };
}
