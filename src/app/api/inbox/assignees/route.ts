import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getOrgInboxTeamUserIds } from "@/lib/push/team";

/** GET — miembros de la org con acceso al inbox (≥ view), para el selector "Asignar a". */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "inbox", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = textAgentsAdminClient();
  const userIds = await getOrgInboxTeamUserIds(orgCtx.organizationId);
  if (!userIds.length) {
    return NextResponse.json({ assignees: [] });
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const assignees = (profiles ?? [])
    .map(p => ({
      user_id: String(p.id),
      name: String(p.full_name ?? "").trim() || String(p.email ?? "").trim() || "Sin nombre"
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return NextResponse.json({ assignees });
}
