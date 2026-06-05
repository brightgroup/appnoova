import { NextResponse } from "next/server";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";

/** Lee la API key de voz en runtime (no requiere rebuild al cambiar .env.local). */
export async function GET() {
  const apiKey = getVoiceGoogleApiKey();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Falta GOOGLE_AI_KEY o NEXT_PUBLIC_GOOGLE_AI_KEY en .env.local. Reinicia el servidor después de guardar."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiKey });
}
