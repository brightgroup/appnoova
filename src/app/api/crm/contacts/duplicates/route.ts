import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { findDuplicateGroups } from "@/lib/crm-contact-timeline";

export async function GET(req: NextRequest) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

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
