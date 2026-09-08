import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { markOrgWhatsAppChannelsPendingReactivation } from "@/lib/whatsapp/billing-lifecycle";

/**
 * POST — activa o renueva manualmente la suscripción de una org que paga por
 * fuera de Paddle (transferencia, Wise, etc.): fija plan y periodo, salda
 * facturas locales pendientes/vencidas y reactiva la cuenta si estaba
 * suspendida. Ver billing_manual_activate (supabase/migrations/120_*.sql).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  const db = adminClient();

  const body = (await req.json().catch(() => null)) as
    | { plan_id?: string; months?: number; reference?: string }
    | null;

  if (!body?.plan_id) {
    return NextResponse.json({ error: "plan_id requerido" }, { status: 400 });
  }

  const months = Number.isFinite(body.months) && Number(body.months) > 0 ? Math.round(Number(body.months)) : 1;

  const { error } = await db.rpc("billing_manual_activate", {
    p_org: orgId,
    p_plan_id: body.plan_id,
    p_months: months,
    p_reference: body.reference || null,
    p_by: auth.userId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let whatsappPending = 0;
  try {
    whatsappPending = await markOrgWhatsAppChannelsPendingReactivation(db, orgId);
  } catch (err) {
    console.error("[billing/manual-activate] whatsapp reactivation:", err);
  }

  return NextResponse.json({ ok: true, whatsappPending });
}
