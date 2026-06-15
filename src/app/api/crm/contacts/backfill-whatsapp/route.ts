import { NextRequest, NextResponse } from "next/server";
import { backfillCrmContactsFromWhatsAppInbox } from "@/lib/crm-contact-backfill";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";

/** Crea/actualiza contactos CRM desde todas las conversaciones WhatsApp del inbox. */
export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = textAgentsAdminClient();

  const { error: probeErr } = await db.from("crm_contacts").select("id").limit(1);
  if (probeErr && isMissingTableError(probeErr)) {
    return NextResponse.json(
      { error: "Ejecuta las migraciones CRM (026 y 029) en Supabase", dbReady: false },
      { status: 503 }
    );
  }

  try {
    const result = await backfillCrmContactsFromWhatsAppInbox(db, userId);
    return NextResponse.json({ ok: true, dbReady: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al sincronizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
