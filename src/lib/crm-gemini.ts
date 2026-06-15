import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";

export function requireOriApiKey(): string {
  const key = getOriApiKey();
  if (!key) {
    throw new Error(
      "Falta ORI_GOOGLE_AI_KEY en .env.local. Configúrala para usar captura IA, cotizaciones y documentos."
    );
  }
  return key;
}

export async function runOriTextPrompt(systemInstruction: string, userPrompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const response = await ai.models.generateContent({
    model: getOriModel(),
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      temperature: 0.5,
      maxOutputTokens: 4096
    }
  });
  const text = response.text?.trim();
  if (!text) throw new Error("La IA no generó respuesta");
  return text;
}

export async function runOriJsonPrompt<T>(systemInstruction: string, userPrompt: string): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const response = await ai.models.generateContent({
    model: getOriModel(),
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });
  const text = response.text?.trim();
  if (!text) throw new Error("La IA no generó JSON");
  return JSON.parse(text) as T;
}

export async function runOriDocumentExtract<T>(
  systemInstruction: string,
  userPrompt: string,
  fileBase64: string,
  mimeType: string
): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: requireOriApiKey() });
  const response = await ai.models.generateContent({
    model: getOriModel(),
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
      responseMimeType: "application/json"
    }
  });
  const text = response.text?.trim();
  if (!text) throw new Error("No se pudo leer el documento");
  return JSON.parse(text) as T;
}
