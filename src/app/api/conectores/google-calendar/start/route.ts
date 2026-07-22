import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { buildGoogleAuthUrl } from "@/lib/google-calendar/oauth";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";

/** GET — arma la URL de consentimiento de Google (el cliente hace window.location a esta URL). */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar no está configurado en el servidor (faltan credenciales OAuth)." },
      { status: 503 }
    );
  }

  const url = buildGoogleAuthUrl({
    organizationId: orgCtx.organizationId,
    userId: orgCtx.userId
  });

  return NextResponse.json({ url });
}
