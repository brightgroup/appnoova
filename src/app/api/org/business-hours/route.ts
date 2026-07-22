import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgBusinessHours, saveOrgBusinessHours } from "@/lib/scheduling/business-hours-db";
import { normalizeOrgBusinessHours } from "@/lib/scheduling/rules";

/** GET — horario de atención de la organización (compartido por todos los agentes). */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const hours = await getOrgBusinessHours(db, orgCtx.organizationId);

  return NextResponse.json({ business_hours: hours });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const hours = normalizeOrgBusinessHours(body.business_hours);

  const db = adminClient();
  try {
    await saveOrgBusinessHours(db, orgCtx.organizationId, hours);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar el horario" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, business_hours: hours });
}
