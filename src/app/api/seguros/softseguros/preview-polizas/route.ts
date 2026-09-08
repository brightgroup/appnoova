import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getSoftsegurosCredentials } from "@/lib/softseguros/connections-db";
import { listPolizas, SoftsegurosApiError } from "@/lib/softseguros/client";

/**
 * Trae la primera página de pólizas TAL CUAL las devuelve Softseguros, sin
 * mapear a nuestras columnas — a propósito. La documentación pública
 * confirma los endpoints pero no el nombre exacto de cada campo de una
 * póliza; antes de construir el sync real hacia la tabla `polizas` (que sí
 * mapea a columnas propias) hay que ver una respuesta real una vez el
 * corredor conecte sus credenciales. Es el mismo criterio que ya se usó con
 * `branch`/`plan_code` de La Equidad: no adivinar el esquema.
 */
export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const credentials = await getSoftsegurosCredentials(db, orgCtx.organizationId);
  if (!credentials) {
    return NextResponse.json({ error: "Softseguros no está conectado para esta organización" }, { status: 400 });
  }

  try {
    const page = await listPolizas(credentials);
    return NextResponse.json({ page });
  } catch (err) {
    const status = err instanceof SoftsegurosApiError ? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error consultando pólizas en Softseguros" },
      { status }
    );
  }
}
