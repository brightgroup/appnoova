import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfigForPipecat } from "@/lib/telephony/bridge-config-response";
import { isPipecatInternalRequest } from "@/lib/telephony/pipecat-auth";

/** GET — config del agente para el servicio Pipecat (auth interna). */
export async function GET(req: NextRequest) {
  if (!isPipecatInternalRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const callControlId = req.nextUrl.searchParams.get("call_control_id")?.trim() ?? "";
  if (!callControlId) {
    return NextResponse.json({ error: "call_control_id requerido" }, { status: 400 });
  }

  const config = await getBridgeConfigForPipecat(callControlId);
  if (!config) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  return NextResponse.json(config);
}
