import { NextRequest, NextResponse } from "next/server";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — contexto fecha/hora Colombia para sesiones de voz (premium y estándar). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ctx = buildColombiaTemporalContext();
  return NextResponse.json({
    dynamicVariables: ctx.dynamicVariables,
    promptBlock: ctx.promptBlock,
  });
}
