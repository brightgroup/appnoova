import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { runOriJsonPrompt, runOriDocumentExtract } from "@/lib/crm-gemini";
import { getAnthropicApiKey, buildAnthropicMediaBlock, readClaudeUsage, createClaudeMessage } from "@/lib/text-agent-generate-claude";
import { getOpenAiApiKey, readOpenAiUsage } from "@/lib/text-agent-generate-openai";
import { withLlmTimeout } from "@/lib/gemini-timeout";
import { providerForLlmModel } from "@/lib/billing/pricing";
import type { GeminiUsage } from "@/lib/billing/meter";

export interface ExtractFileInput {
  base64: string;
  mimeType: string;
}

export interface ExtractStructuredJsonInput {
  /** Modelo elegido en el nodo `action.ai_extract` — decide el proveedor vía providerForLlmModel. */
  model: string;
  systemInstruction: string;
  userPrompt: string;
  /** Archivo original (imagen/PDF) cuando el evento trae media — si falta, es extracción por texto. */
  file?: ExtractFileInput;
}

export interface ExtractStructuredJsonResult {
  result: unknown;
  usage: GeminiUsage;
}

/**
 * Punto de entrada único de la extracción con IA del editor de workflows —
 * análogo a cómo `text-agent-generate.ts` despacha por proveedor para la
 * respuesta conversacional, pero de una sola llamada (sin tool-loop) y con
 * soporte de archivo crudo para no perder calidad pasando por una descripción
 * en texto intermedia.
 */
export async function extractStructuredJson(input: ExtractStructuredJsonInput): Promise<ExtractStructuredJsonResult> {
  const provider = providerForLlmModel(input.model);
  if (provider === "anthropic") return extractWithClaude(input);
  if (provider === "openai") return extractWithOpenAi(input);
  return extractWithGemini(input);
}

async function extractWithGemini(input: ExtractStructuredJsonInput): Promise<ExtractStructuredJsonResult> {
  if (input.file) {
    const { result, usage } = await runOriDocumentExtract<unknown>(
      input.systemInstruction,
      input.userPrompt,
      input.file.base64,
      input.file.mimeType,
      input.model
    );
    return { result, usage };
  }
  const { result, usage } = await runOriJsonPrompt<unknown>(input.systemInstruction, input.userPrompt, input.model);
  return { result, usage };
}

/** Claude a veces envuelve el JSON en ```json ... ``` pese a la instrucción — a diferencia de Gemini/GPT, no tiene JSON mode nativo que lo evite del todo. */
function stripJsonFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text;
}

async function extractWithClaude(input: ExtractStructuredJsonInput): Promise<ExtractStructuredJsonResult> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.file) {
    const kind = input.file.mimeType === "application/pdf" ? "document" : "image";
    content.push(buildAnthropicMediaBlock(input.file.base64, input.file.mimeType, kind));
  }
  content.push({ type: "text", text: input.userPrompt });

  const response = await withLlmTimeout(
    abortSignal =>
      createClaudeMessage(
        client,
        {
          model: input.model,
          system: input.systemInstruction,
          max_tokens: 2048,
          temperature: 0.1,
          messages: [{ role: "user", content }]
        },
        { signal: abortSignal }
      ),
    undefined,
    "Claude"
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude no generó JSON");
  return { result: JSON.parse(stripJsonFences(text)), usage: readClaudeUsage(response) };
}

async function extractWithOpenAi(input: ExtractStructuredJsonInput): Promise<ExtractStructuredJsonResult> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: input.userPrompt }];
  if (input.file) {
    // Chat Completions no tiene input de PDF nativo (a diferencia de Gemini/Claude) — mejor
    // fallar explícito que fingir que leyó el documento.
    if (input.file.mimeType === "application/pdf") {
      throw new Error("GPT-4o mini no soporta PDF en este nodo — elegí Gemini o Claude para documentos.");
    }
    contentParts.push({ type: "image_url", image_url: { url: `data:${input.file.mimeType};base64,${input.file.base64}` } });
  }

  const response = await withLlmTimeout(
    abortSignal =>
      client.chat.completions.create(
        {
          model: input.model,
          messages: [
            { role: "system", content: input.systemInstruction },
            { role: "user", content: contentParts }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        },
        { signal: abortSignal }
      ),
    undefined,
    "OpenAI"
  );

  const text = response.choices[0]?.message.content?.trim();
  if (!text) throw new Error("GPT no generó JSON");
  return { result: JSON.parse(text), usage: readOpenAiUsage(response) };
}
