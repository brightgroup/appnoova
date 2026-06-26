import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { markOrgWhatsAppChannelsPendingReactivation } from "@/lib/whatsapp/billing-lifecycle";

/** POST — marcar una factura como pagada (reactiva la cuenta si estaba suspendida) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const db = adminClient();

  const { data: invoice } = await db
    .from("billing_invoices")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.rpc("billing_mark_invoice_paid", {
    p_invoice: id,
    p_by: auth.userId
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let whatsappPending = 0;
  if (invoice?.organization_id) {
    try {
      whatsappPending = await markOrgWhatsAppChannelsPendingReactivation(
        db,
        String(invoice.organization_id)
      );
    } catch (err) {
      console.error("[billing/pay] whatsapp reactivation:", err);
    }
  }

  return NextResponse.json({ ok: true, whatsappPending });
}
