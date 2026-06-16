import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — detalle de facturación de una organización (suscripción, billetera, consumo, facturas) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  const db = adminClient();

  await db.rpc("billing_sync_wallet", { p_org: orgId });

  const [orgRes, subRes, walletRes, invoicesRes, recentRes] = await Promise.all([
    db.from("organizations").select("id, name, slug, status").eq("id", orgId).maybeSingle(),
    db
      .from("organization_subscriptions")
      .select("*, plans(name, price_usd, monthly_credits)")
      .eq("organization_id", orgId)
      .maybeSingle(),
    db.from("organization_credit_wallets").select("*").eq("organization_id", orgId).maybeSingle(),
    db
      .from("billing_invoices")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(24),
    db
      .from("usage_events")
      .select("id, event_type, channel, credits_charged, provider, provider_cost_cop, total_tokens, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50)
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

  return NextResponse.json({
    organization: orgRes.data ?? null,
    subscription: subRes.data ?? null,
    wallet: wallet ?? null,
    usage,
    invoices: invoicesRes.data ?? [],
    recent_events: recentRes.data ?? []
  });
}
