import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { findDuplicateGroups } from "@/lib/crm-contact-timeline";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const contactId = req.nextUrl.searchParams.get("contact_id");
  const db = textAgentsAdminClient();

  const { data: rows, error } = await db.from("crm_contacts").select("*").eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const data = (rows ?? []).map(row => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    whatsapp: row.whatsapp ? String(row.whatsapp) : null,
    email: row.email ? String(row.email) : null,
    documento_id: row.documento_id != null ? String(row.documento_id) : null,
    updated_at: String(row.updated_at ?? "")
  }));

  const groups = findDuplicateGroups(data ?? []);
  const filtered = contactId
    ? groups.filter(g => g.contacts.some(c => c.id === contactId))
    : groups;

  return NextResponse.json({ groups: filtered });
}
