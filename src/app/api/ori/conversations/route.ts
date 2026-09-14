import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import { resolveOrgIdForUser } from "@/lib/billing/meter";
import { listConversations } from "@/lib/ori/ori-conversations-db";

/**
 * GET /api/ori/conversations → historial de chats de Ori del usuario (panel "Chats").
 * No hay POST acá: un chat nuevo no se guarda hasta que tiene al menos un mensaje real —
 * /api/ori/chat lo crea solo (lazy) cuando llega sin conversation_id, igual que
 * Claude/ChatGPT/Gemini nunca dejan una fila vacía en el historial por apretar "+".
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = adminClient();
  const organizationId = await resolveOrgIdForUser(db, userId);
  if (!organizationId) return NextResponse.json({ conversations: [] });

  try {
    const conversations = await listConversations(db, organizationId, userId);
    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al listar chats";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
