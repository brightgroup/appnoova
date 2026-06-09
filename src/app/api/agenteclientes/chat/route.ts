import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Servicio no disponible temporalmente." },
      { status: 503 }
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
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
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
      return NextResponse.json({ error: "No se generó respuesta" }, { status: 502 });
    }

    return NextResponse.json({ reply, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
