import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { createPaddleCheckoutTransaction } from "@/lib/billing/paddle/client";

/** POST { plan_id } — crea una transacción Paddle en borrador para abrir el checkout overlay. */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const planId = body?.plan_id as string | undefined;
  if (!planId) {
    return NextResponse.json({ error: "plan_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: plan } = await db
    .from("plans")
    .select("id, name, paddle_price_id_sandbox, paddle_price_id_live")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
  }

  const priceId =
    process.env.PADDLE_ENV === "live" ? plan.paddle_price_id_live : plan.paddle_price_id_sandbox;

  if (!priceId) {
    return NextResponse.json(
      { error: `El plan ${plan.name} no tiene precio configurado en Paddle (${process.env.PADDLE_ENV ?? "sandbox"})` },
      { status: 422 }
    );
  }

  try {
    const transaction = await createPaddleCheckoutTransaction({
      priceId,
      organizationId: ctx.organizationId,
    });
    return NextResponse.json({ transaction_id: transaction.id });
  } catch (err) {
    console.error("[paddle:checkout]", err);
    return NextResponse.json({ error: "No se pudo iniciar el checkout" }, { status: 502 });
  }
}
