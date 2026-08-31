import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { getOpenAiApiKey, readOpenAiUsage } from "@/lib/text-agent-generate-openai";
import { readGeminiUsage } from "@/lib/billing/meter";
import { withLlmTimeout } from "@/lib/gemini-timeout";
import { resolveInternalEngineChain, type LlmEngine } from "@/lib/llm/engines";
import { isEngineOpen, recordEngineFailure, recordEngineSuccess } from "@/lib/llm/breaker";
import type { OriPromptResult } from "@/lib/crm-gemini";

async function callGemini<T>(
  systemInstruction: string,
  userPrompt: string,
  maxOutputTokens?: number
): Promise<OriPromptResult<T>> {
  const apiKey = getOriApiKey();
  if (!apiKey) throw new Error("Falta ORI_GOOGLE_AI_KEY");
  const ai = new GoogleGenAI({ apiKey });
  const model = getOriModel();
  const response = await withLlmTimeout(
    abortSignal =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          abortSignal
        }
      }),
    undefined,
    "Gemini"
  );
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini no generó JSON");
  return { result: JSON.parse(text) as T, usage: readGeminiUsage(response), model };
}

async function callOpenAi<T>(
  systemInstruction: string,
  userPrompt: string,
  maxOutputTokens?: number
): Promise<OriPromptResult<T>> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = "gpt-4o-mini";
  const response = await withLlmTimeout(
    abortSignal =>
      client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
          ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {})
        },
        { signal: abortSignal }
      ),
    undefined,
    "OpenAI"
  );
  const text = response.choices[0]?.message.content?.trim();
  if (!text) throw new Error("GPT no generó JSON");
  return { result: JSON.parse(text) as T, usage: readOpenAiUsage(response), model };
}

async function callEngine<T>(
  engine: LlmEngine,
  systemInstruction: string,
  userPrompt: string,
  maxOutputTokens?: number
): Promise<OriPromptResult<T>> {
  return engine.provider === "openai"
    ? callOpenAi<T>(systemInstruction, userPrompt, maxOutputTokens)
    : callGemini<T>(systemInstruction, userPrompt, maxOutputTokens);
}

/**
 * Igual que `runOriJsonPrompt` (mismo contrato: system + prompt → JSON tipado),
 * pero para las tareas de IA de fondo que hoy pegan directo a Gemini sin
 * respaldo — extracción de leads, análisis de llamadas, captura de campañas.
 * Reparte la carga entre GPT-4o mini y Gemini Flash (`resolveInternalEngineChain`)
 * y, si el que arrancó falla, reintenta con el otro antes de rendirse — mismo
 * circuit breaker que ya usa el chat de WhatsApp (`generateTextAgentReply`), así
 * que si un proveedor está con problemas para todo el sistema, estas tareas
 * también lo saltan como primario en vez de perder el turno completo esperando
 * su timeout.
 *
 * No reemplaza `runOriJsonPrompt` con `modelOverride` explícito (ej. el nodo
 * "Extraer con IA" del editor de workflows, donde el modelo es elección del
 * cliente) — ahí el proveedor ya lo decide el cliente, no corresponde rotarlo.
 */
export async function runInternalJsonPrompt<T>(
  systemInstruction: string,
  userPrompt: string,
  maxOutputTokens?: number
): Promise<OriPromptResult<T>> {
  const chain = resolveInternalEngineChain();
  const healthy = chain.filter(engine => !isEngineOpen(engine.id));
  const engines = healthy.length > 0 ? healthy : chain;

  let lastError: unknown;
  for (const engine of engines) {
    try {
      const result = await callEngine<T>(engine, systemInstruction, userPrompt, maxOutputTokens);
      recordEngineSuccess(engine.id);
      return result;
    } catch (err) {
      recordEngineFailure(engine.id);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Todos los motores de IA interna fallaron");
}
