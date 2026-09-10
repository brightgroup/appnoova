import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createPaddleCheckoutTransaction } from "@/lib/billing/paddle/client";

/**
 * POST { package_id } — crea una transacción Paddle para comprar créditos
 * puntuales (compra manual, no la recarga automática). El webhook los
 * distingue de un pago de plan por custom_data.kind === "topup".
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const packageId = body?.package_id as string | undefined;
  if (!packageId) {
    return NextResponse.json({ error: "package_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: pkg } = await db
    .from("credit_packages")
    .select("id, is_active, paddle_price_id_sandbox, paddle_price_id_live")
    .eq("id", packageId)
    .maybeSingle();

  if (!pkg || pkg.is_active === false) {
    return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
  }

  const priceId =
    process.env.PADDLE_ENV === "live" ? pkg.paddle_price_id_live : pkg.paddle_price_id_sandbox;

  if (!priceId) {
    return NextResponse.json(
      { error: `El paquete no tiene precio configurado en Paddle (${process.env.PADDLE_ENV ?? "sandbox"})` },
      { status: 422 }
    );
  }

  const { data: payer } = await db.from("profiles").select("email").eq("id", ctx.userId).maybeSingle();

  try {
    const transaction = await createPaddleCheckoutTransaction({
      priceId,
      organizationId: ctx.organizationId,
      customData: { kind: "topup", package_id: packageId },
      customerEmail: payer?.email ?? undefined,
    });
    return NextResponse.json({ transaction_id: transaction.id });
  } catch (err) {
    console.error("[paddle:credits-checkout]", err);
    const message = err instanceof Error ? err.message : "No se pudo iniciar la compra";
    const clientMessage = message.startsWith("Paddle API error") ? message : "No se pudo iniciar la compra";
    return NextResponse.json({ error: clientMessage }, { status: 422 });
  }
}
