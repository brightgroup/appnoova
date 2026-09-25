import { NextResponse } from "next/server";
import { getMetaMessagingLoginConfig } from "@/lib/meta-messaging/login-config";

/** GET — configuración pública del login de Meta para Messenger + Instagram. */
export async function GET() {
  return NextResponse.json(getMetaMessagingLoginConfig());
}
