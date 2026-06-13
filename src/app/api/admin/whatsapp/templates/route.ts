import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";
import { syncPendingWhatsAppTemplates } from "@/lib/whatsapp/template-sync";

export interface AdminPendingTemplateRow {
  id: string;
  template_name: string;
  status: string;
  category: string;
  body_preview: string;
  body_source: string | null;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
  channel_e164: string | null;
  channel_friendly_name: string | null;
  user_email: string | null;
  user_nombre: string | null;
}

/** Vista admin: plantillas pendientes de aprobación (todos los inquilinos). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const statusFilter = req.nextUrl.searchParams.get("status") ?? "pending_approval";
  const db = adminClient();

  await syncPendingWhatsAppTemplates(db);

  let query = db.from("whatsapp_templates").select("*").order("updated_at", { ascending: false });

  if (statusFilter === "pending_approval") {
    query = query.eq("status", "pending_approval");
  } else if (statusFilter === "all_pending") {
    query = query.in("status", ["pending_approval", "rejected"]);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ templates: [], dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map(row => toWhatsAppTemplateRecord(row));
  const channelIds = [...new Set(rows.map(r => r.whatsapp_channel_id))];
  const userIds = [...new Set(rows.map(r => r.user_id))];

  const [{ data: channels }, { data: users }] = await Promise.all([
    channelIds.length
      ? db.from("whatsapp_channels").select("id, e164, friendly_name").in("id", channelIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? db.from("users").select("id, email, nombre").in("id", userIds)
      : Promise.resolve({ data: [] })
  ]);

  const channelMap = new Map((channels ?? []).map(c => [String(c.id), c]));
  const userMap = new Map((users ?? []).map(u => [String(u.id), u]));

  const templates: AdminPendingTemplateRow[] = rows.map(tpl => {
    const ch = channelMap.get(tpl.whatsapp_channel_id);
    const user = userMap.get(tpl.user_id);
    return {
      id: tpl.id,
      template_name: tpl.template_name,
      status: tpl.status,
      category: tpl.category,
      body_preview: tpl.body_preview,
      body_source: tpl.body_source,
      created_at: tpl.created_at,
      updated_at: tpl.updated_at,
      rejection_reason: tpl.rejection_reason,
      channel_e164: ch?.e164 ?? null,
      channel_friendly_name: ch?.friendly_name ?? null,
      user_email: user?.email ?? null,
      user_nombre: user?.nombre ?? null
    };
  });

  const pendingCount = templates.filter(t => t.status === "pending_approval").length;

  return NextResponse.json({ templates, pending_count: pendingCount, dbReady: true });
}
