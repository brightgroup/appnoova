import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import {
  checkBillingForUser,
  readGeminiUsage,
  recordUsageSafe
} from "@/lib/billing/meter";

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
  const companyContextId = body.company_context_id as string | undefined;
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const billingDb = adminClient();
  const billing = await checkBillingForUser(billingDb, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      {
        error:
          billing.reason === "no_credits"
            ? "Te quedaste sin créditos este mes. Recarga o espera tu próxima fecha de facturación."
            : "Tu cuenta está suspendida. Regulariza el pago para reactivar ORI.",
        code: billing.reason
      },
      { status: 402 }
    );
  }

  let companyContextText = "";
  if (companyContextId) {
    const db = adminClient();
    const { data } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", companyContextId)
      .eq("user_id", userId)
      .maybeSingle();
    companyContextText = data?.content ?? "";
  } else {
    const db = adminClient();
    const { data } = await db
      .from("company_contexts")
      .select("content")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    companyContextText = data?.content ?? "";
  }

  const systemInstruction = mergeCompanyContext(ORI_SYSTEM_PROMPT, companyContextText);
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
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    });

    const reply = response.text?.trim();
    if (!reply) {
      return NextResponse.json({ error: "Ori no generó respuesta" }, { status: 502 });
    }

    if (billing.organizationId) {
      await recordUsageSafe({
        db: billingDb,
        organizationId: billing.organizationId,
        userId,
        eventType: "ori",
        channel: "ori",
        provider: "google",
        model,
        gemini: readGeminiUsage(response)
      });
    }

    return NextResponse.json({ reply, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar Gemini";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
