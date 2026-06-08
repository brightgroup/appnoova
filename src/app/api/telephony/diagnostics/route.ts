import { NextResponse } from "next/server";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";
import { getAppBaseUrl, telnyxMediaStreamWsUrl } from "@/lib/telephony/app-url";
import { telnyxConfigStatus } from "@/lib/telephony/telnyx-provider";

/** GET — diagnóstico telefonía (sin secretos). */
export async function GET() {
  const telnyx = telnyxConfigStatus();
  return NextResponse.json({
    app_url: getAppBaseUrl(),
    media_stream_ws: telnyxMediaStreamWsUrl(),
    telnyx_configured: telnyx.configured,
    telnyx_has_connection: telnyx.has_connection,
    google_voice_key: Boolean(getVoiceGoogleApiKey()),
    server_mode: "custom_ws_server",
    start_command: "npm start (tsx server.ts)"
  });
}
