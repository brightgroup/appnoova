import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import { readGeminiUsage, recordUsageSafe, resolveOrgIdForUser } from "@/lib/billing/meter";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Demo interna de ventas ("Allianz" hardcodeado en broker-config.ts), no una
 * función de ningún cliente pagador. Antes era 100% pública y sin límite —
 * cualquiera podía golpearla gratis usando ORI_GOOGLE_AI_KEY sin dejar rastro
 * en /admin/consumption. Ahora requiere sesión de Noova.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

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
  const temporal = buildColombiaTemporalContext();
  const systemInstruction = `${temporal.promptBlock}\n\n${ORI_SYSTEM_PROMPT}`;

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }]
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    });

    const reply = response.text?.trim();
    if (!reply) {
      return NextResponse.json({ error: "No se generó respuesta" }, { status: 502 });
    }

    const db = adminClient();
    const organizationId = await resolveOrgIdForUser(db, userId);
    if (organizationId) {
      await recordUsageSafe({
        db,
        organizationId,
        userId,
        eventType: "ori",
        channel: "agenteclientes_demo",
        provider: "google",
        model,
        gemini: readGeminiUsage(response),
        creditsOverride: 0,
        referenceType: "agenteclientes_demo"
      });
    }

    return NextResponse.json({ reply, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
