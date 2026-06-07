import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { getDefaultProviderId, getTelephonyProvider } from "@/lib/telephony";
import { telnyxConfigStatus } from "@/lib/telephony/telnyx-provider";

/** GET — estado de configuración Telnyx para el panel admin. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const providerId = getDefaultProviderId();
  const provider = getTelephonyProvider(providerId);
  const telnyx = telnyxConfigStatus();

  return NextResponse.json({
    provider: providerId,
    configured: provider.isConfigured(),
    telnyx,
    env_file: ".env.local",
    required: {
      TELNYX_API_KEY: "API Key → Telnyx Mission Control → API Keys → Create Key",
      TELNYX_CONNECTION_ID: "(Opcional) Voice → Connections → ID de tu Call Control App",
      TELEPHONY_PROVIDER: "telnyx",
      NOOVA_APP_URL: "URL pública para webhooks, ej. https://tu-dominio.com"
    }
  });
}
