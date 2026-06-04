import { NextResponse } from "next/server";

/** Lee la API key en runtime (no requiere rebuild al cambiar .env.local). */
export async function GET() {
  const apiKey =
    process.env.GOOGLE_AI_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_AI_KEY?.trim() ||
    "";

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
