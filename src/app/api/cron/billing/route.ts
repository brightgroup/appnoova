import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { suspendWhatsAppForSuspendedOrganizations } from "@/lib/whatsapp/billing-lifecycle";
import { syncOfficialTrm } from "@/lib/billing/trm-colombia";

/**
 * Job de facturación (ejecutar 1 vez al día por cron):
 *  - marca facturas vencidas (overdue)
 *  - suspende cuentas con facturas vencidas pasado el periodo de gracia
 *  - suspende trials gratuitos vencidos (Explorador)
 *  - renueva periodos y reinicia créditos (vencen, no se acumulan)
 *  - genera la factura del nuevo periodo
 *  - desconecta líneas WhatsApp de cuentas suspendidas
 *  - sincroniza TRM oficial COP/USD (Superfinanciera)
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

  let trm: Awaited<ReturnType<typeof syncOfficialTrm>> | null = null;
  try {
    trm = await syncOfficialTrm(db);
  } catch (err) {
    console.error("[cron/billing] trm sync:", err);
  }

  const { data, error } = await db.rpc("billing_run_renewals");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let whatsapp: Awaited<ReturnType<typeof suspendWhatsAppForSuspendedOrganizations>> = [];
  try {
    whatsapp = await suspendWhatsAppForSuspendedOrganizations(db);
  } catch (err) {
    console.error("[cron/billing] whatsapp suspend:", err);
  }

  return NextResponse.json({ ok: true, result: data, whatsapp, trm });
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
