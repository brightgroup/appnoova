import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — configuración de recarga automática + catálogo de paquetes disponibles. */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const [{ data: settings }, { data: packages }, { data: sub }] = await Promise.all([
    db.from("organization_autorecharge").select("*").eq("organization_id", ctx.organizationId).maybeSingle(),
    db.from("credit_packages").select("id, credits, price_usd").eq("is_active", true).order("sort_order"),
    db.from("organization_subscriptions").select("billing_provider").eq("organization_id", ctx.organizationId).maybeSingle(),
  ]);

  return NextResponse.json({
    settings: settings ?? null,
    packages: packages ?? [],
    // La recarga automática cobra a la tarjeta guardada — solo disponible para
    // cuentas que ya pagan por Paddle (no manual/Bold).
    available: sub?.billing_provider === "paddle",
  });
}

/** PUT { enabled, threshold_credits, package_credits, monthly_cap_usd } — guarda la configuración. */
export async function PUT(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const body = (await req.json().catch(() => null)) as
    | { enabled?: boolean; threshold_credits?: number; package_credits?: number; monthly_cap_usd?: number }
    | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("billing_provider")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (body.enabled && sub?.billing_provider !== "paddle") {
    return NextResponse.json(
      { error: "Necesitas pagar con tarjeta (Paddle) para activar la recarga automática" },
      { status: 422 }
    );
  }

  const { data: existing } = await db
    .from("organization_autorecharge")
    .select("consent_at")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  const { error } = await db.from("organization_autorecharge").upsert({
    organization_id: ctx.organizationId,
    enabled: Boolean(body.enabled),
    threshold_credits: body.threshold_credits != null ? Math.max(0, Math.round(body.threshold_credits)) : undefined,
    package_credits: body.package_credits != null ? Math.round(body.package_credits) : undefined,
    monthly_cap_usd: body.monthly_cap_usd != null ? Math.max(0, body.monthly_cap_usd) : undefined,
    // Queda como prueba de consentimiento la primera vez que se activa (ver /terminos §6).
    consent_at: body.enabled && !existing?.consent_at ? new Date().toISOString() : existing?.consent_at,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
