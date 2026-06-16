import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — estado de facturación de la organización activa (saldo, plan, consumo, facturas) */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const orgId = ctx.organizationId;

  // Asegura que la billetera esté en el periodo vigente (vence créditos del mes anterior)
  await db.rpc("billing_sync_wallet", { p_org: orgId });

  const [subRes, walletRes, invoicesRes] = await Promise.all([
    db
      .from("organization_subscriptions")
      .select("*, plans(name, price_usd, monthly_credits, whatsapp_included, support_level)")
      .eq("organization_id", orgId)
      .maybeSingle(),
    db.from("organization_credit_wallets").select("*").eq("organization_id", orgId).maybeSingle(),
    db
      .from("billing_invoices")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  const wallet = walletRes.data;
  let usage: { event_type: string; events: number; credits: number; cost_cop: number }[] = [];
  if (wallet) {
    const { data: summary } = await db.rpc("billing_usage_summary", {
      p_org: orgId,
      p_from: wallet.period_start,
      p_to: new Date().toISOString()
    });
    usage = (summary ?? []).map((r: Record<string, unknown>) => ({
      event_type: String(r.event_type),
      events: Number(r.events ?? 0),
      credits: Number(r.credits ?? 0),
      cost_cop: Number(r.cost_cop ?? 0)
    }));
  }

  const included = Number(wallet?.included_credits ?? 0);
  const topup = Number(wallet?.topup_credits ?? 0);
  const used = Number(wallet?.used_credits ?? 0);
  const total = included + topup;
  const remaining = total - used;

  return NextResponse.json({
    organization: { id: orgId, name: ctx.organizationName },
    subscription: subRes.data ?? null,
    wallet: wallet
      ? {
          period_start: wallet.period_start,
          period_end: wallet.period_end,
          included_credits: included,
          topup_credits: topup,
          used_credits: used,
          total_credits: total,
          remaining_credits: remaining,
          used_pct: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
        }
      : null,
    usage,
    invoices: invoicesRes.data ?? []
  });
}
