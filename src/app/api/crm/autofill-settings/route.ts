import { NextRequest, NextResponse } from "next/server";
import { requireCrmAccess } from "@/lib/crm-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getOrgCrmAutofillEnabled, setOrgCrmAutofillEnabled } from "@/lib/crm-autofill-settings";

export async function GET(req: NextRequest) {
  const ctx = await requireCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = textAgentsAdminClient();
  const enabled = await getOrgCrmAutofillEnabled(db, ctx.organizationId);
  return NextResponse.json({ enabled });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCrmAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  await setOrgCrmAutofillEnabled(db, ctx.organizationId, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
