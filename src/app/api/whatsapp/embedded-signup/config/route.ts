import { NextRequest, NextResponse } from "next/server";
import { getMetaEmbeddedSignupPublicConfig } from "@/lib/meta/embedded-signup-config";

/** GET — configuración pública para iniciar Meta Embedded Signup en el cliente. */
export async function GET() {
  const config = getMetaEmbeddedSignupPublicConfig();
  return NextResponse.json(config);
}
