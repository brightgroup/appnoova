import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

export async function requireAdmin(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = adminClient();
  const { data, error } = await db.from("users").select("rol").eq("id", userId).maybeSingle();
  if (error || data?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return { userId };
}
