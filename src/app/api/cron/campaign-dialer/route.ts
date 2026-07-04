import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { runDialerTickIfDue } from "@/lib/call-engine/dialer-scheduler";

/**
 * Motor de marcado de campañas — ejecutar cada N minutos (según reglas en admin).
 *
 * Auth: header `x-cron-secret` == CRON_SECRET, o superadmin autenticado.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      const auth = await requireSuperAdmin(req);
      if (auth instanceof NextResponse) return auth;
    }
  } else {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const result = await runDialerTickIfDue(true);
    if (!result) {
      return NextResponse.json({
        ok: true,
        skipped: "not_due_or_disabled",
        message: "Motor apagado o tick reciente — espera unos segundos e intenta de nuevo.",
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en marcador";
    console.error("[cron/campaign-dialer]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
