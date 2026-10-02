import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { reconcileWhatsAppChannels } from "@/lib/whatsapp/channel-health";

/**
 * Chequeo de salud de líneas WhatsApp (cada 15 min, ver
 * .github/workflows/whatsapp-health-cron.yml): reactiva líneas que quedaron
 * apagadas tras un pago y re-vincula webhooks de Twilio desconectados.
 *
 * Auth: header `x-cron-secret` == CRON_SECRET, o superadmin autenticado.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (!secret || provided !== secret) {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const result = await reconcileWhatsAppChannels(adminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/whatsapp-health]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en el chequeo" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
