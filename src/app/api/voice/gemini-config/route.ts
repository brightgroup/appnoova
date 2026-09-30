import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

/** Ventana para abrir la sesión Live con el token (luego ya no sirve para iniciar otra). */
const NEW_SESSION_WINDOW_MS = 2 * 60 * 1000;
/** Duración máxima de la sesión de voz abierta con el token. */
const SESSION_MAX_MS = 30 * 60 * 1000;

/**
 * GET — token efímero de un solo uso para Gemini Live desde el navegador.
 * Nunca devuelve la API key real: el cliente solo recibe un token que abre
 * una sesión Live durante una ventana corta. Requiere usuario autenticado.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const apiKey = getVoiceGoogleApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta GOOGLE_AI_KEY en el servidor. Reinicia el servidor después de guardar." },
      { status: 500 }
    );
  }

  try {
    const now = Date.now();
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
        expireTime: new Date(now + SESSION_MAX_MS).toISOString(),
        httpOptions: { apiVersion: "v1alpha" }
      }
    });
    if (!token.name) throw new Error("token vacío");
    return NextResponse.json({ token: token.name });
  } catch (e) {
    console.error("[voice/gemini-config] No se pudo crear token efímero:", e);
    return NextResponse.json({ error: "No se pudo iniciar la sesión de voz." }, { status: 502 });
  }
}
