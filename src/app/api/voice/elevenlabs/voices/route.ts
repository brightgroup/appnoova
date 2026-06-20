import { NextRequest, NextResponse } from "next/server";
import { listElevenLabsVoices } from "@/lib/elevenlabs/sync-agent";
import { getElevenLabsApiKey } from "@/lib/elevenlabs/config";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — catálogo de voces ElevenLabs para el wizard/config premium. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!getElevenLabsApiKey()) {
    return NextResponse.json(
      { error: "La voz premium no está disponible temporalmente" },
      { status: 503 }
    );
  }

  try {
    const voices = await listElevenLabsVoices();
    return NextResponse.json({ voices });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al listar voces";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
