import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import { resolveOrgIdForUser } from "@/lib/billing/meter";
import { getConversationWithMessages, deleteConversation } from "@/lib/ori/ori-conversations-db";

/** GET /api/ori/conversations/[id] → un chat guardado con todos sus mensajes, para cargarlo en el panel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = adminClient();
  const organizationId = await resolveOrgIdForUser(db, userId);
  if (!organizationId) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

  try {
    const conversation = await getConversationWithMessages(db, organizationId, userId, id);
    if (!conversation) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al cargar el chat";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/ori/conversations/[id] → borra un chat del historial. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = adminClient();
  const organizationId = await resolveOrgIdForUser(db, userId);
  if (!organizationId) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });

  try {
    const deleted = await deleteConversation(db, organizationId, userId, id);
    if (!deleted) return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al borrar el chat";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
