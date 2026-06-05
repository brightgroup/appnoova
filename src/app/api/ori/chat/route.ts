import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Falta ORI_GOOGLE_AI_KEY en .env.local. Crea una API key aparte en Google AI Studio para Ori y reinicia el servidor."
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const messages = (body.messages ?? []) as ChatMessage[];
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const model = getOriModel();
  const ai = new GoogleGenAI({ apiKey });

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }]
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: ORI_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    });

    const reply = response.text?.trim();
    if (!reply) {
      return NextResponse.json({ error: "Ori no generó respuesta" }, { status: 502 });
    }

    return NextResponse.json({ reply, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar Gemini";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
