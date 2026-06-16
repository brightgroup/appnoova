import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Job de facturación (ejecutar 1 vez al día por cron):
 *  - marca facturas vencidas (overdue)
 *  - suspende cuentas con facturas vencidas pasado el periodo de gracia
 *  - renueva periodos y reinicia créditos (vencen, no se acumulan)
 *  - genera la factura del nuevo periodo
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

  const db = adminClient();
  const { data, error } = await db.rpc("billing_run_renewals");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, result: data });
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
