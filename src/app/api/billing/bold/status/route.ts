import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";

/** GET ?request_id=... — estado de un link de pago Bold, para hacer polling desde el botón de checkout. */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "view");
  if (ctx instanceof NextResponse) return ctx;

  const requestId = req.nextUrl.searchParams.get("request_id");
  if (!requestId) {
    return NextResponse.json({ error: "request_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data } = await db
    .from("bold_payment_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return NextResponse.json({ status: data.status });
}
