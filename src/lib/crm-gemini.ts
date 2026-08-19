import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { readGeminiUsage, type GeminiUsage } from "@/lib/billing/meter";
import { withGeminiTimeout } from "@/lib/gemini-timeout";

export function requireOriApiKey(): string {
  const key = getOriApiKey();
  if (!key) {
    throw new Error(
      "Falta ORI_GOOGLE_AI_KEY en .env.local. Configúrala para usar captura IA, cotizaciones y documentos."
    );
  }
  return key;
}

export interface OriPromptResult<T> {
  result: T;
  usage: GeminiUsage;
  model: string;
}

export async function runOriTextPrompt(
  systemInstruction: string,
  userPrompt: string
): Promise<OriPromptResult<string>> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const model = getOriModel();
  const response = await withGeminiTimeout(abortSignal =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        temperature: 0.5,
        maxOutputTokens: 4096,
        abortSignal
      }
    })
  );
  const text = response.text?.trim();
  if (!text) throw new Error("La IA no generó respuesta");
  return { result: text, usage: readGeminiUsage(response), model };
}

export async function runOriJsonPrompt<T>(
  systemInstruction: string,
  userPrompt: string
): Promise<OriPromptResult<T>> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const model = getOriModel();
  const response = await withGeminiTimeout(abortSignal =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        abortSignal
      }
    })
  );
  const text = response.text?.trim();
  if (!text) throw new Error("La IA no generó JSON");
  return { result: JSON.parse(text) as T, usage: readGeminiUsage(response), model };
}

export async function runOriDocumentExtract<T>(
  systemInstruction: string,
  userPrompt: string,
  fileBase64: string,
  mimeType: string
): Promise<OriPromptResult<T>> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const model = getOriModel();
  const response = await withGeminiTimeout(abortSignal =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: fileBase64 } },
            { text: userPrompt }
          ]
        }
      ],
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
        abortSignal
      }
    })
  );
  const text = response.text?.trim();
  if (!text) throw new Error("No se pudo leer el documento");
  return { result: JSON.parse(text) as T, usage: readGeminiUsage(response), model };
}
