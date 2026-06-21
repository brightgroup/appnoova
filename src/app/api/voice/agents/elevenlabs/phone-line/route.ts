import { NextRequest, NextResponse } from "next/server";
import { getElevenLabsApiKey, getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";
import { getElevenLabsPhoneLineInfo, listElevenLabsPhoneNumbers } from "@/lib/elevenlabs/phone-line";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — línea remitente premium (ElevenLabs SIP) para pruebas telefónicas. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!getElevenLabsApiKey()) {
    return NextResponse.json({
      configured: false,
      error: "Voz premium no disponible",
    });
  }

  const line = await getElevenLabsPhoneLineInfo();
  const availableNumbers = line.configured ? [] : await listElevenLabsPhoneNumbers();
  return NextResponse.json({
    ...line,
    available_numbers: availableNumbers,
  });
}
